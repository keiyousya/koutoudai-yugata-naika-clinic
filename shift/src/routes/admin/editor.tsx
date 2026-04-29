import { createRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Route as rootRoute } from "../__root";
import { fetchCalendar } from "@/api/shift";
import {
  fetchAdminStaff,
  fetchAdminAssignments,
  fetchAdminRequests,
  saveAssignments,
  publishPeriod,
  unpublishPeriod,
} from "@/api/admin";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/editor",
  component: AdminEditorPage,
});

function getNextMonth(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

interface LocalAssignment {
  nurse?: number;
  clerk?: number;
}

function AdminEditorPage() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(getNextMonth());
  const [localAssignments, setLocalAssignments] = useState<Record<string, LocalAssignment>>({});
  const [toast, setToast] = useState<string | null>(null);

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["calendar", selectedMonth],
    queryFn: () => fetchCalendar(selectedMonth),
  });

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ["adminStaff"],
    queryFn: fetchAdminStaff,
  });

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["adminAssignments", selectedMonth],
    queryFn: () => fetchAdminAssignments(selectedMonth),
  });

  const { data: requests } = useQuery({
    queryKey: ["adminRequests", selectedMonth],
    queryFn: () => fetchAdminRequests(selectedMonth),
  });

  // サーバーからの割当をローカル状態に反映
  useEffect(() => {
    if (assignments) {
      const local: Record<string, LocalAssignment> = {};
      for (const a of assignments.assignments) {
        if (!local[a.date]) local[a.date] = {};
        local[a.date][a.role] = a.staff.id;
      }
      setLocalAssignments(local);
    }
  }, [assignments]);

  const nurses = useMemo(
    () => staff?.filter((s) => s.role === "nurse" && s.is_active) || [],
    [staff]
  );
  const clerks = useMemo(
    () => staff?.filter((s) => s.role === "clerk" && s.is_active) || [],
    [staff]
  );

  const saveMutation = useMutation({
    mutationFn: (force: boolean) => {
      const items: Array<{ date: string; role: "nurse" | "clerk"; staff_id: number }> = [];
      for (const [date, assignment] of Object.entries(localAssignments)) {
        if (assignment.nurse) {
          items.push({ date, role: "nurse", staff_id: assignment.nurse });
        }
        if (assignment.clerk) {
          items.push({ date, role: "clerk", staff_id: assignment.clerk });
        }
      }
      return saveAssignments(selectedMonth, items, force);
    },
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminAssignments", selectedMonth] });
    },
    onError: (err: Error & { warnings?: string[] }) => {
      if (err.message.includes("警告があります")) {
        const forceConfirm = confirm(
          "警告があります。強制的に保存しますか?\n" + (err.message || "")
        );
        if (forceConfirm) {
          saveMutation.mutate(true);
        }
      } else {
        setToast(`エラー: ${err.message}`);
      }
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishPeriod(selectedMonth),
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminAssignments", selectedMonth] });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishPeriod(selectedMonth),
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["adminAssignments", selectedMonth] });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const navigateMonth = (delta: number) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    const newYear = newDate.getFullYear();
    const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  const handleAssignmentChange = (date: string, role: "nurse" | "clerk", staffId: number | null) => {
    setLocalAssignments((prev) => {
      const current = prev[date] || {};
      if (staffId === null) {
        const updated = { ...current };
        delete updated[role];
        if (Object.keys(updated).length === 0) {
          const { [date]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [date]: updated };
      }
      return { ...prev, [date]: { ...current, [role]: staffId } };
    });
  };

  // 警告の計算
  const getWarning = (date: string, _role: "nurse" | "clerk", staffId?: number): string | null => {
    if (!staffId || !requests) return null;
    const req = requests.matrix[date]?.[staffId];
    if (req?.availability === "unavailable") {
      const staffName = staff?.find((s) => s.id === staffId)?.name;
      return `${staffName}さんは「不可」`;
    }
    return null;
  };

  const isLoading = calendarLoading || staffLoading || assignmentsLoading;
  const isPublished = assignments?.published ?? false;
  const openDays = calendar?.days.filter((d) => d.is_open) || [];

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold">シフト編集</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => saveMutation.mutate(false)}
            disabled={saveMutation.isPending}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            下書き保存
          </button>
          {isPublished ? (
            <button
              onClick={() => unpublishMutation.mutate()}
              className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              公開取り下げ
            </button>
          ) : (
            <button
              onClick={() => publishMutation.mutate()}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              公開
            </button>
          )}
        </div>
      </div>

      {/* 月ナビゲーション */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-secondary rounded-lg">
          ◀
        </button>
        <h2 className="text-xl font-bold">{selectedMonth}</h2>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-secondary rounded-lg">
          ▶
        </button>
      </div>

      {isPublished && (
        <div className="mb-4 p-2 bg-green-100 text-green-800 rounded text-center text-sm">
          公開済み（{assignments?.published_at}）
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">読み込み中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-secondary">
                <th className="p-2 text-left border">日付</th>
                <th className="p-2 text-center border">看護師</th>
                <th className="p-2 text-center border">事務</th>
              </tr>
            </thead>
            <tbody>
              {openDays.map((day) => {
                const date = new Date(day.date);
                const dayNum = date.getDate();
                const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
                const weekday = weekdays[date.getDay()];
                const assignment = localAssignments[day.date] || {};
                const nurseWarning = getWarning(day.date, "nurse", assignment.nurse);
                const clerkWarning = getWarning(day.date, "clerk", assignment.clerk);

                return (
                  <tr key={day.date} className="border-t">
                    <td className="p-2 border">
                      {dayNum} ({weekday})
                    </td>
                    <td className={`p-2 border ${nurseWarning ? "bg-yellow-50" : ""}`}>
                      <select
                        value={assignment.nurse || ""}
                        onChange={(e) =>
                          handleAssignmentChange(
                            day.date,
                            "nurse",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="w-full p-1 border rounded"
                      >
                        <option value="">-</option>
                        {nurses.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                      </select>
                      {nurseWarning && (
                        <div className="text-xs text-yellow-600 mt-1">{nurseWarning}</div>
                      )}
                    </td>
                    <td className={`p-2 border ${clerkWarning ? "bg-yellow-50" : ""}`}>
                      <select
                        value={assignment.clerk || ""}
                        onChange={(e) =>
                          handleAssignmentChange(
                            day.date,
                            "clerk",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="w-full p-1 border rounded"
                      >
                        <option value="">-</option>
                        {clerks.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {clerkWarning && (
                        <div className="text-xs text-yellow-600 mt-1">{clerkWarning}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
