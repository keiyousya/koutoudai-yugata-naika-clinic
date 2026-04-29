import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Route as rootRoute } from "./__root";
import { fetchStaffList, login } from "@/api/shift";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: staffList, isLoading } = useQuery({
    queryKey: ["staffList"],
    queryFn: fetchStaffList,
  });

  const loginMutation = useMutation({
    mutationFn: () => {
      if (!selectedStaffId) throw new Error("スタッフを選択してください");
      return login(selectedStaffId, passcode);
    },
    onSuccess: (data) => {
      loginStore(data.staff.id, passcode, data.staff.name, data.staff.role);
      navigate({ to: "/request" });
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  const handlePasscodeInput = (digit: string) => {
    if (passcode.length < 4) {
      setPasscode(passcode + digit);
    }
  };

  const handlePasscodeDelete = () => {
    setPasscode(passcode.slice(0, -1));
  };

  if (isLoading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold text-center mb-8">スタッフログイン</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">スタッフを選択</label>
          <select
            value={selectedStaffId ?? ""}
            onChange={(e) => setSelectedStaffId(Number(e.target.value) || null)}
            className="w-full p-3 border rounded-lg bg-white"
          >
            <option value="">選択してください</option>
            {staffList?.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}（{staff.role === "nurse" ? "看護師" : "事務"}）
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">パスコード（4桁）</label>
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-12 h-12 border-2 rounded-lg flex items-center justify-center text-2xl font-bold"
              >
                {passcode[i] ? "●" : ""}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((digit, i) => (
              <button
                key={i}
                type="button"
                disabled={digit === ""}
                onClick={() => {
                  if (digit === "←") {
                    handlePasscodeDelete();
                  } else if (digit !== "") {
                    handlePasscodeInput(digit);
                  }
                }}
                className={`h-14 text-xl font-bold rounded-lg transition-colors ${
                  digit === ""
                    ? "invisible"
                    : "bg-secondary hover:bg-secondary/80 active:bg-secondary/60"
                }`}
              >
                {digit}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedStaffId || passcode.length !== 4 || loginMutation.isPending}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50"
        >
          {loginMutation.isPending ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
