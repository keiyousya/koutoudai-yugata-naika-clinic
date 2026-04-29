import { createRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Route as rootRoute } from "../__root";
import {
  fetchCalendarOverrides,
  addCalendarOverride,
  deleteCalendarOverride,
  type CalendarOverride,
} from "@/api/admin";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/calendar",
  component: AdminCalendarPage,
});

function AdminCalendarPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    is_open: false,
    note: "",
  });
  const [toast, setToast] = useState<string | null>(null);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["calendarOverrides"],
    queryFn: fetchCalendarOverrides,
  });

  const addMutation = useMutation({
    mutationFn: addCalendarOverride,
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["calendarOverrides"] });
      setIsFormOpen(false);
      setFormData({ date: "", is_open: false, note: "" });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCalendarOverride,
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["calendarOverrides"] });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(formData);
  };

  const handleDelete = (override: CalendarOverride) => {
    if (confirm(`${override.date} の例外日を削除しますか?`)) {
      deleteMutation.mutate(override.date);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold">営業日設定</h1>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          例外日を追加
        </button>
      </div>

      {/* 説明バナー */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="font-bold mb-2">既定の営業日ルール</h2>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>月曜・火曜は休診</li>
          <li>祝日は休診</li>
          <li>水・木・金・土・日は営業</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-2">
          上記ルールの例外を以下で設定できます。
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-secondary">
            <th className="p-2 text-left">日付</th>
            <th className="p-2 text-left">状態</th>
            <th className="p-2 text-left">備考</th>
            <th className="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {overrides?.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-muted-foreground">
                例外日はありません
              </td>
            </tr>
          )}
          {overrides?.map((override) => (
            <tr key={override.date} className="border-t">
              <td className="p-2">{override.date}</td>
              <td className="p-2">
                {override.is_open ? (
                  <span className="text-green-600">臨時診療</span>
                ) : (
                  <span className="text-red-600">臨時休診</span>
                )}
              </td>
              <td className="p-2">{override.note || "-"}</td>
              <td className="p-2 text-center">
                <button
                  onClick={() => handleDelete(override)}
                  className="text-sm text-red-600 hover:underline"
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* フォームモーダル */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">例外日を追加</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">日付</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">状態</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!formData.is_open}
                      onChange={() => setFormData({ ...formData, is_open: false })}
                    />
                    臨時休診
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={formData.is_open}
                      onChange={() => setFormData({ ...formData, is_open: true })}
                    />
                    臨時診療
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">備考</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full p-2 border rounded"
                  placeholder="例: 院長学会"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded"
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-2 bg-secondary rounded"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 text-white rounded-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
