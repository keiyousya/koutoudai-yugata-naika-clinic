import { createRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Route as rootRoute } from "../__root";
import { checkAdminAuth } from "@/api/admin";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const authed = await checkAdminAuth();
      setIsAuthed(authed);
      setIsChecking(false);
    };
    check();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    localStorage.setItem("shift_admin_key", apiKey);
    const authed = await checkAdminAuth();
    if (authed) {
      setIsAuthed(true);
    } else {
      localStorage.removeItem("shift_admin_key");
      setError("認証に失敗しました");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("shift_admin_key");
    setIsAuthed(false);
    setApiKey("");
  };

  if (isChecking) {
    return <div className="text-center py-8">確認中...</div>;
  }

  if (!isAuthed) {
    return (
      <div className="max-w-md mx-auto py-8">
        <h1 className="text-2xl font-bold text-center mb-8">管理者ログイン</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">管理者APIキー</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-3 border rounded-lg"
              placeholder="APIキーを入力"
            />
          </div>
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded-lg text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold"
          >
            ログイン
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">管理画面</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ログアウト
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/admin/staff"
          className="block p-6 border rounded-lg hover:bg-secondary transition-colors"
        >
          <h2 className="text-lg font-bold mb-2">スタッフ管理</h2>
          <p className="text-sm text-muted-foreground">
            スタッフの登録・編集・無効化
          </p>
        </Link>

        <Link
          to="/admin/calendar"
          className="block p-6 border rounded-lg hover:bg-secondary transition-colors"
        >
          <h2 className="text-lg font-bold mb-2">営業日設定</h2>
          <p className="text-sm text-muted-foreground">
            臨時休診・臨時診療の設定
          </p>
        </Link>

        <Link
          to="/admin/requests"
          className="block p-6 border rounded-lg hover:bg-secondary transition-colors"
        >
          <h2 className="text-lg font-bold mb-2">希望集計</h2>
          <p className="text-sm text-muted-foreground">
            スタッフの希望提出状況を確認
          </p>
        </Link>

        <Link
          to="/admin/editor"
          className="block p-6 border rounded-lg hover:bg-secondary transition-colors"
        >
          <h2 className="text-lg font-bold mb-2">シフト編集</h2>
          <p className="text-sm text-muted-foreground">
            確定シフトの作成・公開
          </p>
        </Link>
      </div>
    </div>
  );
}
