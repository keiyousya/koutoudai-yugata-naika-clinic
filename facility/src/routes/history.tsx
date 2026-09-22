import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Route as rootRoute } from "./__root";
import { fetchTemperatureLogs } from "@/api/facility";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function HistoryPage() {
  const navigate = useNavigate();
  const { isLoggedIn, restore } = useAuthStore();
  const [month, setMonth] = useState(getCurrentMonth);

  useEffect(() => {
    if (!isLoggedIn) {
      const restored = restore();
      if (!restored) navigate({ to: "/" });
    }
  }, [isLoggedIn, restore, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["temperatureLogs", month],
    queryFn: () => fetchTemperatureLogs(month),
    enabled: isLoggedIn,
  });

  if (!isLoggedIn) return null;

  const logs = data?.logs ?? [];

  // 日付ごとにグループ化
  const logsByDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const existing = logsByDate.get(log.recorded_date) ?? [];
    existing.push(log);
    logsByDate.set(log.recorded_date, existing);
  }
  const sortedDates = [...logsByDate.keys()].sort().reverse();

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">記録履歴</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="p-2 border rounded-lg text-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {month} の記録はありません
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dayLogs = logsByDate.get(date)!;
            const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(date).getDay()];
            return (
              <div key={date} className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-2 text-sm font-medium">
                  {date}（{weekday}）
                </div>
                <div className="divide-y">
                  {dayLogs.map((log) => {
                    const outOfRange = log.temperature < 2 || log.temperature > 8;
                    return (
                      <div key={log.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground w-12">
                            {log.recorded_time}
                          </span>
                          <span
                            className={`text-lg font-bold ${outOfRange ? "text-destructive" : ""}`}
                          >
                            {log.temperature}°C
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {log.equipment_name}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">{log.staff_name}</span>
                          {log.note && (
                            <p className="text-xs text-muted-foreground mt-0.5">{log.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
