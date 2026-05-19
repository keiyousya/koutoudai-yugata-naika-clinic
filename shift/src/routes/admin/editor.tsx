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

interface SlotAssignment {
  nurse?: number;
  clerk?: number;
}

// date -> slot -> assignment
type LocalAssignments = Record<string, Record<string, SlotAssignment>>;

function AdminEditorPage() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(getNextMonth());
  const [localAssignments, setLocalAssignments] = useState<LocalAssignments>({});
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
      const local: LocalAssignments = {};
      for (const a of assignments.assignments) {
        if (!local[a.date]) local[a.date] = {};
        if (!local[a.date][a.slot]) local[a.date][a.slot] = {};
        local[a.date][a.slot][a.role] = a.staff.id;
      }
      setLocalAssignments(local);
    }
  }, [assignments]);

  const nurses = useMemo(
    () => staff?.filter((s) => s.role === "nurse" && s.is_active) || [],
    [staff]
  );
  // 事務枠には看護師も入れるため、全スタッフを候補にする
  const clerkCandidates = useMemo(
    () => staff?.filter((s) => s.is_active) || [],
    [staff]
  );

  const saveMutation = useMutation({
    mutationFn: (force: boolean) => {
      const items: Array<{ date: string; slot: "day" | "evening"; role: "nurse" | "clerk"; staff_id: number }> = [];
      for (const [date, slots] of Object.entries(localAssignments)) {
        for (const [slot, assignment] of Object.entries(slots)) {
          if (assignment.nurse) {
            items.push({ date, slot: slot as "day" | "evening", role: "nurse", staff_id: assignment.nurse });
          }
          if (assignment.clerk) {
            items.push({ date, slot: slot as "day" | "evening", role: "clerk", staff_id: assignment.clerk });
          }
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

  const handleAssignmentChange = (date: string, slot: "day" | "evening", role: "nurse" | "clerk", staffId: number | null) => {
    setLocalAssignments((prev) => {
      const dateSlots = prev[date] || {};
      const current = dateSlots[slot] || {};
      if (staffId === null) {
        const updated = { ...current };
        delete updated[role];
        if (Object.keys(updated).length === 0) {
          const { [slot]: _, ...restSlots } = dateSlots;
          if (Object.keys(restSlots).length === 0) {
            const { [date]: __, ...rest } = prev;
            return rest;
          }
          return { ...prev, [date]: restSlots };
        }
        return { ...prev, [date]: { ...dateSlots, [slot]: updated } };
      }
      return { ...prev, [date]: { ...dateSlots, [slot]: { ...current, [role]: staffId } } };
    });
  };

  // 警告の計算
  const getWarning = (date: string, slot: string, staffId?: number): string | null => {
    if (!staffId || !requests) return null;
    const req = requests.matrix[date]?.[slot]?.[staffId];
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
                <th className="p-2 text-center border">時間帯</th>
                <th className="p-2 text-center border">看護師</th>
                <th className="p-2 text-center border">事務</th>
              </tr>
            </thead>
            <tbody>
              {openDays.flatMap((day) => {
                const date = new Date(day.date);
                const dayNum = date.getDate();
                const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
                const weekday = weekdays[date.getDay()];
                const slots = day.slots || ["evening"];
                const slotLabels: Record<string, string> = {
                  day: "14-17時",
                  evening: "17-21時",
                };

                return slots.map((slot, slotIdx) => {
                  const slotAssignment = localAssignments[day.date]?.[slot] || {};
                  const nurseWarning = getWarning(day.date, slot, slotAssignment.nurse);
                  const clerkWarning = getWarning(day.date, slot, slotAssignment.clerk);

                  return (
                    <tr key={`${day.date}-${slot}`} className={slotIdx === 0 ? "border-t" : ""}>
                      {slotIdx === 0 && (
                        <td className="p-2 border" rowSpan={slots.length}>
                          {dayNum} ({weekday})
                        </td>
                      )}
                      <td className="p-2 border text-center text-xs">
                        {slotLabels[slot]}
                      </td>
                      <td className={`p-2 border ${nurseWarning ? "bg-yellow-50" : ""}`}>
                        <select
                          value={slotAssignment.nurse || ""}
                          onChange={(e) =>
                            handleAssignmentChange(
                              day.date,
                              slot as "day" | "evening",
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
                          value={slotAssignment.clerk || ""}
                          onChange={(e) =>
                            handleAssignmentChange(
                              day.date,
                              slot as "day" | "evening",
                              "clerk",
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          className="w-full p-1 border rounded"
                        >
                          <option value="">-</option>
                          {clerkCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.role === "nurse" ? " (看)" : ""}
                            </option>
                          ))}
                        </select>
                        {clerkWarning && (
                          <div className="text-xs text-yellow-600 mt-1">{clerkWarning}</div>
                        )}
                      </td>
                    </tr>
                  );
                });
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
