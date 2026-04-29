import { createRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Route as rootRoute } from "../__root";
import { fetchCalendar } from "@/api/shift";
import { fetchAdminRequests, lockPeriod, unlockPeriod } from "@/api/admin";
import { fetchPeriod } from "@/api/shift";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/requests",
  component: AdminRequestsPage,
});

function getNextMonth(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function AdminRequestsPage() {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(getNextMonth());
  const [toast, setToast] = useState<string | null>(null);

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["adminRequests", selectedMonth],
    queryFn: () => fetchAdminRequests(selectedMonth),
  });

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["calendar", selectedMonth],
    queryFn: () => fetchCalendar(selectedMonth),
  });

  const { data: period } = useQuery({
    queryKey: ["period", selectedMonth],
    queryFn: () => fetchPeriod(selectedMonth),
  });

  const lockMutation = useMutation({
    mutationFn: () => lockPeriod(selectedMonth),
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["period", selectedMonth] });
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockPeriod(selectedMonth),
    onSuccess: (data) => {
      setToast(data.message);
      queryClient.invalidateQueries({ queryKey: ["period", selectedMonth] });
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

  const exportCSV = () => {
    if (!requests) return;
    const headers = ["日付", ...requests.staff.map((s) => s.name)];
    const lines: string[] = [headers.join(",")];

    for (const day of requests.days) {
      const row: string[] = [day];
      for (const staff of requests.staff) {
        const req = requests.matrix[day]?.[staff.id];
        if (req) {
          row.push(req.availability === "available" ? "○" : "×");
        } else {
          row.push("");
        }
      }
      lines.push(row.join(","));
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `requests_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = requestsLoading || calendarLoading;
  const isLocked = period?.submission_locked ?? false;

  // 営業日のみ表示
  const openDays = calendar?.days.filter((d) => d.is_open).map((d) => d.date) || [];

  return (
    <div className="max-w-6xl mx-auto py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold">希望集計</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={!requests}
            className="px-3 py-1 text-sm border rounded hover:bg-secondary"
          >
            CSVエクスポート
          </button>
          {isLocked ? (
            <button
              onClick={() => unlockMutation.mutate()}
              className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              ロック解除
            </button>
          ) : (
            <button
              onClick={() => lockMutation.mutate()}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              提出ロック
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

      {isLocked && (
        <div className="mb-4 p-2 bg-yellow-100 text-yellow-800 rounded text-center text-sm">
          提出はロックされています
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">読み込み中...</div>
      ) : requests ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-secondary">
                <th className="p-2 text-left border sticky left-0 bg-secondary">日付</th>
                {requests.staff.map((staff) => (
                  <th key={staff.id} className="p-2 text-center border min-w-[60px]">
                    <div>{staff.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {staff.role === "nurse" ? "看" : "事"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openDays.map((day) => {
                const date = new Date(day);
                const dayNum = date.getDate();
                const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
                const weekday = weekdays[date.getDay()];

                return (
                  <tr key={day} className="border-t">
                    <td className="p-2 border sticky left-0 bg-white">
                      {dayNum} ({weekday})
                    </td>
                    {requests.staff.map((staff) => {
                      const req = requests.matrix[day]?.[staff.id];
                      return (
                        <td
                          key={staff.id}
                          className={`p-2 text-center border ${
                            req?.availability === "available"
                              ? "bg-green-100 text-green-700"
                              : req?.availability === "unavailable"
                              ? "bg-red-100 text-red-700"
                              : "text-gray-400"
                          }`}
                        >
                          {req?.availability === "available"
                            ? "○"
                            : req?.availability === "unavailable"
                            ? "×"
                            : "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 text-white rounded-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
