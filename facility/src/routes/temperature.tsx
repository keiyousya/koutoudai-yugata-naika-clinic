import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Route as rootRoute } from "./__root";
import { createTemperatureLog } from "@/api/facility";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/temperature",
  component: TemperaturePage,
});

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCurrentTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function TemperaturePage() {
  const navigate = useNavigate();
  const { isLoggedIn, restore } = useAuthStore();
  const queryClient = useQueryClient();

  const [equipmentName] = useState("冷蔵庫");
  const [temperature, setTemperature] = useState("");
  const [recordedDate, setRecordedDate] = useState(getTodayString);
  const [recordedTime, setRecordedTime] = useState(getCurrentTimeString);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      const restored = restore();
      if (!restored) navigate({ to: "/" });
    }
  }, [isLoggedIn, restore, navigate]);

  const mutation = useMutation({
    mutationFn: () =>
      createTemperatureLog({
        equipment_name: equipmentName,
        temperature: parseFloat(temperature),
        recorded_date: recordedDate,
        recorded_time: recordedTime,
        note: note || undefined,
      }),
    onSuccess: () => {
      setSuccess(true);
      setTemperature("");
      setNote("");
      setRecordedTime(getCurrentTimeString());
      queryClient.invalidateQueries({ queryKey: ["temperatureLogs"] });
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const isValidTemperature = temperature !== "" && !isNaN(parseFloat(temperature));
  const tempValue = isValidTemperature ? parseFloat(temperature) : null;
  const isOutOfRange = tempValue !== null && (tempValue < 2 || tempValue > 8);

  if (!isLoggedIn) return null;

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">温度記録</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-5"
      >
        <div>
          <label className="block text-sm font-medium mb-1">設備名</label>
          <div className="p-3 border rounded-lg bg-muted text-muted-foreground">
            {equipmentName}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">温度 (°C)</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="例: 4.5"
            className="w-full p-3 border rounded-lg text-lg"
          />
          {isOutOfRange && (
            <p className="mt-1 text-sm text-destructive font-medium">
              ワクチン保管適正温度（2〜8°C）の範囲外です
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">日付</label>
            <input
              type="date"
              value={recordedDate}
              onChange={(e) => setRecordedDate(e.target.value)}
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">時刻</label>
            <input
              type="time"
              value={recordedTime}
              onChange={(e) => setRecordedTime(e.target.value)}
              className="w-full p-3 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">備考</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="任意"
            className="w-full p-3 border rounded-lg"
          />
        </div>

        {mutation.isError && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center">
            {(mutation.error as Error).message}
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-100 text-green-700 rounded-lg text-center">
            記録しました
          </div>
        )}

        <button
          type="submit"
          disabled={!isValidTemperature || mutation.isPending}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50"
        >
          {mutation.isPending ? "記録中..." : "記録する"}
        </button>
      </form>
    </div>
  );
}
