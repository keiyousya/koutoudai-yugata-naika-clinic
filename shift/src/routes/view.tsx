import { createRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Route as rootRoute } from "./__root";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/view",
  component: ViewPage,
});

// 確定シフトは LINE WORKS のカレンダーを唯一の正とし、スタッフにはアプリから公開しない
function ViewPage() {
  const navigate = useNavigate();
  const { isLoggedIn, staffName, restore } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn && !restore()) {
      navigate({ to: "/" });
    }
  }, [isLoggedIn, restore, navigate]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="text-center mb-4">
        <span className="text-sm text-muted-foreground">
          ログイン中: {staffName || ""}
        </span>
      </div>

      <div className="border rounded-lg p-6 text-center space-y-3">
        <h2 className="text-xl font-bold">シフトの確認方法</h2>
        <p>
          確定したシフトは <span className="font-bold">LINE WORKS のカレンダー</span> から確認してください。
        </p>
        <p className="text-sm text-muted-foreground">
          「看護師シフト」「受付事務シフト」のカレンダーに表示されます。
        </p>
      </div>
    </div>
  );
}
