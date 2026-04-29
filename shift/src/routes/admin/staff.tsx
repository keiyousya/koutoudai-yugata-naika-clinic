import { createRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Route as rootRoute } from "../__root";
import {
  fetchAdminStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  type AdminStaff,
} from "@/api/admin";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/staff",
  component: AdminStaffPage,
});

function AdminStaffPage() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AdminStaff | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "nurse" as "nurse" | "clerk",
    passcode: "",
    sort_order: 0,
  });
  const [toast, setToast] = useState<string | null>(null);

  const { data: staffList, isLoading } = useQuery({
    queryKey: ["adminStaff"],
    queryFn: fetchAdminStaff,
  });

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminStaff"] });
      closeForm();
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(id, data),
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminStaff"] });
      closeForm();
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStaff,
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminStaff"] });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const openCreateForm = () => {
    setEditingStaff(null);
    setFormData({ name: "", role: "nurse", passcode: "", sort_order: 0 });
    setIsFormOpen(true);
  };

  const openEditForm = (staff: AdminStaff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      role: staff.role,
      passcode: "",
      sort_order: staff.sort_order,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingStaff(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStaff) {
      const data: Parameters<typeof updateStaff>[1] = {};
      if (formData.name !== editingStaff.name) data.name = formData.name;
      if (formData.role !== editingStaff.role) data.role = formData.role;
      if (formData.passcode) data.passcode = formData.passcode;
      if (formData.sort_order !== editingStaff.sort_order) data.sort_order = formData.sort_order;
      updateMutation.mutate({ id: editingStaff.id, data });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (staff: AdminStaff) => {
    if (confirm(`「${staff.name}」さんを無効化しますか?`)) {
      deleteMutation.mutate(staff.id);
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
          <h1 className="text-xl font-bold">スタッフ管理</h1>
        </div>
        <button
          onClick={openCreateForm}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          新規登録
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-secondary">
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">名前</th>
            <th className="p-2 text-left">職種</th>
            <th className="p-2 text-center">状態</th>
            <th className="p-2 text-center">表示順</th>
            <th className="p-2 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {staffList?.map((staff) => (
            <tr key={staff.id} className={`border-t ${!staff.is_active ? "opacity-50" : ""}`}>
              <td className="p-2">{staff.id}</td>
              <td className="p-2">{staff.name}</td>
              <td className="p-2">{staff.role === "nurse" ? "看護師" : "事務"}</td>
              <td className="p-2 text-center">
                {staff.is_active ? (
                  <span className="text-green-600">有効</span>
                ) : (
                  <span className="text-red-600">無効</span>
                )}
              </td>
              <td className="p-2 text-center">{staff.sort_order}</td>
              <td className="p-2 text-center">
                <button
                  onClick={() => openEditForm(staff)}
                  className="text-sm text-blue-600 hover:underline mr-2"
                >
                  編集
                </button>
                {staff.is_active && (
                  <button
                    onClick={() => handleDelete(staff)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    無効化
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* フォームモーダル */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">
              {editingStaff ? "スタッフ編集" : "スタッフ登録"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名前</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">職種</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as "nurse" | "clerk" })}
                  className="w-full p-2 border rounded"
                >
                  <option value="nurse">看護師</option>
                  <option value="clerk">事務</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  パスコード（4桁）{editingStaff && "- 変更する場合のみ入力"}
                </label>
                <input
                  type="text"
                  value={formData.passcode}
                  onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
                  className="w-full p-2 border rounded"
                  pattern="\d{4}"
                  maxLength={4}
                  required={!editingStaff}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">表示順</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) })}
                  className="w-full p-2 border rounded"
                  min={0}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded"
                >
                  {editingStaff ? "更新" : "登録"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
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
