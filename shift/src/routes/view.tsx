import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Route as rootRoute } from "./__root";
import { fetchCalendar, fetchAssignments, type AssignmentItem } from "@/api/shift";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/view",
  component: ViewPage,
});

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function ViewPage() {
  const navigate = useNavigate();
  const { isLoggedIn, staffId, staffName, restore } = useAuthStore();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  useEffect(() => {
    if (!isLoggedIn && !restore()) {
      navigate({ to: "/" });
    }
  }, [isLoggedIn, restore, navigate]);

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["calendar", selectedMonth],
    queryFn: () => fetchCalendar(selectedMonth),
    enabled: isLoggedIn,
  });

  const {
    data: assignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery({
    queryKey: ["assignments", selectedMonth],
    queryFn: () => fetchAssignments(selectedMonth),
    enabled: isLoggedIn,
    retry: false,
  });

  // 月送り
  const navigateMonth = (delta: number) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    const newYear = newDate.getFullYear();
    const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  // 日付ごとの割当をマップ化
  const assignmentsByDate = useMemo(() => {
    if (!assignments) return new Map<string, { nurse?: AssignmentItem; clerk?: AssignmentItem }>();
    const map = new Map<string, { nurse?: AssignmentItem; clerk?: AssignmentItem }>();
    for (const a of assignments.assignments) {
      if (!map.has(a.date)) {
        map.set(a.date, {});
      }
      const entry = map.get(a.date)!;
      entry[a.role] = a;
    }
    return map;
  }, [assignments]);

  const isLoading = calendarLoading || assignmentsLoading;
  const isNotPublished = assignmentsError?.message === "シフトはまだ公開されていません";

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

      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 hover:bg-secondary rounded-lg"
        >
          ◀
        </button>
        <h2 className="text-xl font-bold">{selectedMonth} 確定シフト</h2>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 hover:bg-secondary rounded-lg"
        >
          ▶
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">読み込み中...</div>
      ) : isNotPublished ? (
        <div className="text-center py-12 text-muted-foreground">
          シフトはまだ公開されていません
        </div>
      ) : assignments ? (
        <>
          {assignments.published_at && (
            <div className="text-center text-sm text-muted-foreground mb-4">
              公開日: {new Date(assignments.published_at).toLocaleDateString("ja-JP")}
            </div>
          )}

          {/* シフト表 */}
          <div className="border rounded-lg overflow-hidden print:border-black">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary">
                  <th className="p-2 text-left border-r">日付</th>
                  <th className="p-2 text-center border-r">曜日</th>
                  <th className="p-2 text-center border-r">看護師</th>
                  <th className="p-2 text-center">事務</th>
                </tr>
              </thead>
              <tbody>
                {calendar?.days.map((day) => {
                  const assignment = assignmentsByDate.get(day.date);
                  const date = new Date(day.date);
                  const dayNum = date.getDate();
                  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
                  const weekday = weekdays[date.getDay()];
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  const isMyNurse = assignment?.nurse?.staff.id === staffId;
                  const isMyClerk = assignment?.clerk?.staff.id === staffId;

                  if (!day.is_open) {
                    return (
                      <tr key={day.date} className="bg-gray-100 text-gray-400">
                        <td className="p-2 border-r border-t">{dayNum}</td>
                        <td className="p-2 text-center border-r border-t">{weekday}</td>
                        <td className="p-2 text-center border-r border-t" colSpan={2}>
                          休診
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={day.date} className="border-t">
                      <td className="p-2 border-r">
                        <span className={isWeekend ? (date.getDay() === 0 ? "text-red-500" : "text-blue-500") : ""}>
                          {dayNum}
                        </span>
                      </td>
                      <td className={`p-2 text-center border-r ${
                        date.getDay() === 0 ? "text-red-500" : date.getDay() === 6 ? "text-blue-500" : ""
                      }`}>
                        {weekday}
                      </td>
                      <td className={`p-2 text-center border-r ${isMyNurse ? "bg-yellow-100 font-bold" : ""}`}>
                        {assignment?.nurse?.staff.name || "-"}
                      </td>
                      <td className={`p-2 text-center ${isMyClerk ? "bg-yellow-100 font-bold" : ""}`}>
                        {assignment?.clerk?.staff.name || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 凡例 */}
          <div className="mt-4 text-sm text-muted-foreground print:hidden">
            <span className="inline-block px-2 py-1 bg-yellow-100 rounded mr-2">黄色</span>
            は自分の担当日です
          </div>
        </>
      ) : null}

      {/* 印刷スタイル */}
      <style>{`
        @media print {
          body { font-size: 12px; }
          header, .print\\:hidden { display: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
