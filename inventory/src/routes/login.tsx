import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Route as rootRoute } from "./__root";
import { fetchStaffList, login } from "@/api/inventory";
import type { Staff } from "@/api/inventory";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [selectedStaffId, setSelectedStaffId] = useState<number>(0);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: staffList } = useQuery({
    queryKey: ["auth-staff"],
    queryFn: fetchStaffList,
  });

  const handleNumpad = (num: string) => {
    if (passcode.length < 4) {
      setPasscode((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    setPasscode((prev) => prev.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (!selectedStaffId || passcode.length !== 4) return;
    setError("");
    setLoading(true);
    try {
      const result = await login(selectedStaffId, passcode);
      authLogin(result.staff_id, passcode, result.name);
      navigate({ to: "/medicine" });
    } catch (err: any) {
      setError(err.message || "ログインに失敗しました");
      setPasscode("");
    } finally {
      setLoading(false);
    }
  };

  // 4桁入力で自動送信
  if (passcode.length === 4 && selectedStaffId && !loading) {
    handleSubmit();
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-lg">ログイン</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">スタッフ</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(Number(e.target.value));
                setPasscode("");
                setError("");
              }}
            >
              <option value={0}>選択してください</option>
              {(staffList ?? []).map((s: Staff) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">パスコード</label>
            <div className="flex justify-center gap-2 mb-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                    i < passcode.length
                      ? "border-primary bg-primary"
                      : "border-input"
                  }`}
                >
                  {i < passcode.length && (
                    <div className="w-3 h-3 rounded-full bg-primary-foreground" />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <Button
                  key={num}
                  variant="outline"
                  className="h-12 text-lg"
                  onClick={() => handleNumpad(num)}
                  disabled={!selectedStaffId || passcode.length >= 4}
                >
                  {num}
                </Button>
              ))}
              <div />
              <Button
                variant="outline"
                className="h-12 text-lg"
                onClick={() => handleNumpad("0")}
                disabled={!selectedStaffId || passcode.length >= 4}
              >
                0
              </Button>
              <Button
                variant="ghost"
                className="h-12 text-sm"
                onClick={handleDelete}
                disabled={passcode.length === 0}
              >
                削除
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-center text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
