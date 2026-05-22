import { createRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Route as rootRoute } from "./__root";
import {
  fetchCalendar,
  fetchPeriod,
  fetchMyRequests,
  updateMyRequests,
  type CalendarDay,
} from "@/api/shift";
import { useAuthStore } from "@/stores/auth";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/request",
  component: RequestPage,
});

function getMonthAfterNext(): string {
  const now = new Date();
  const monthAfterNext = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const year = monthAfterNext.getFullYear();
  const month = String(monthAfterNext.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

type Availability = "available" | "conditional" | "unavailable" | null;
// date -> slot -> availability
type LocalRequests = Record<string, Record<string, Availability>>;

function RequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isLoggedIn, staffName, restore } = useAuthStore();
  const [selectedMonth, setSelectedMonth] = useState(getMonthAfterNext());
  const [localRequests, setLocalRequests] = useState<LocalRequests>({});
  const [toast, setToast] = useState<string | null>(null);

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

  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: ["period", selectedMonth],
    queryFn: () => fetchPeriod(selectedMonth),
    enabled: isLoggedIn,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const { data: myRequests, isLoading: requestsLoading } = useQuery({
    queryKey: ["myRequests", selectedMonth],
    queryFn: () => fetchMyRequests(selectedMonth),
    enabled: isLoggedIn,
  });

  // サーバーからの希望をローカル状態に反映
  useEffect(() => {
    if (myRequests) {
      const requests: LocalRequests = {};
      for (const req of myRequests.requests) {
        if (!requests[req.date]) requests[req.date] = {};
        requests[req.date][req.slot] = req.availability;
      }
      setLocalRequests(requests);
    }
  }, [myRequests]);

  const isLocked = period?.submission_locked ?? false;

  const saveMutation = useMutation({
    mutationFn: () => {
      const items: Array<{ date: string; slot: "day" | "evening"; availability: "available" | "conditional" | "unavailable" }> = [];
      for (const [date, slots] of Object.entries(localRequests)) {
        for (const [slot, availability] of Object.entries(slots)) {
          if (availability !== null) {
            items.push({
              date,
              slot: slot as "day" | "evening",
              availability,
            });
          }
        }
      }
      return updateMyRequests(selectedMonth, items);
    },
    onSuccess: () => {
      setToast("希望を保存しました");
      queryClient.invalidateQueries({ queryKey: ["myRequests", selectedMonth] });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast(`エラー: ${(err as Error).message}`);
      setTimeout(() => setToast(null), 5000);
    },
  });

  const toggleRequest = (date: string, slot: string) => {
    if (isLocked) return;
    setLocalRequests((prev) => {
      const dateSlots = prev[date] || {};
      const current = dateSlots[slot];
      if (current === "available") {
        return { ...prev, [date]: { ...dateSlots, [slot]: "conditional" } };
      } else if (current === "conditional") {
        return { ...prev, [date]: { ...dateSlots, [slot]: "unavailable" } };
      } else if (current === "unavailable") {
        return { ...prev, [date]: { ...dateSlots, [slot]: null } };
      } else {
        return { ...prev, [date]: { ...dateSlots, [slot]: "available" } };
      }
    });
  };

  const setAllAvailable = () => {
    if (isLocked || !calendar) return;
    const requests: LocalRequests = {};
    for (const day of calendar.days) {
      if (day.is_open && day.slots) {
        requests[day.date] = {};
        for (const slot of day.slots) {
          requests[day.date][slot] = "available";
        }
      }
    }
    setLocalRequests(requests);
  };

  const clearAll = () => {
    if (isLocked) return;
    setLocalRequests({});
  };

  // 月送り
  const navigateMonth = (delta: number) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    const newYear = newDate.getFullYear();
    const newMonth = String(newDate.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  // カレンダーグリッド用のデータを構築
  const calendarGrid = useMemo(() => {
    if (!calendar) return [];

    const [year, month] = selectedMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const grid: Array<CalendarDay | null> = [];

    // 月の最初の曜日まで埋める
    for (let i = 0; i < firstDay.getDay(); i++) {
      grid.push(null);
    }

    // 日付を追加
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const day = calendar.days.find((day) => day.date === dateStr);
      grid.push(day || null);
    }

    return grid;
  }, [calendar, selectedMonth]);

  const isLoading = calendarLoading || periodLoading || requestsLoading;

  if (!isLoggedIn) {
    return null;
  }

  const slotLabels: Record<string, string> = {
    day: "14-17",
    evening: "17-21",
  };

  return (
    <div className="max-w-lg mx-auto py-4">
      <div className="text-center mb-4">
        <span className="text-sm text-muted-foreground">
          ログイン中: {staffName || ""}
        </span>
      </div>

      {isLocked && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-center">
          締切を過ぎています（閲覧のみ）
        </div>
      )}

      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 hover:bg-secondary rounded-lg"
        >
          ◀
        </button>
        <h2 className="text-xl font-bold">{selectedMonth}</h2>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 hover:bg-secondary rounded-lg"
        >
          ▶
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">読み込み中...</div>
      ) : (
        <>
          {/* カレンダー */}
          <div className="mb-4">
            <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2">
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <div
                  key={d}
                  className={`font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarGrid.map((day, i) => {
                if (!day) {
                  return <div key={i} className="h-20" />;
                }

                const dateRequests = localRequests[day.date] || {};
                const dayNum = parseInt(day.date.split("-")[2], 10);
                const isOpen = day.is_open;
                const dayOfWeek = new Date(day.date).getDay();
                const slots = day.slots || ["evening"];
                const hasMultipleSlots = slots.length > 1;

                if (!isOpen) {
                  return (
                    <div
                      key={day.date}
                      className="h-20 rounded-lg bg-gray-200 text-gray-400 flex flex-col items-center justify-center text-sm"
                    >
                      <span>{dayNum}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={day.date}
                    className="h-20 rounded-lg bg-secondary flex flex-col items-center text-sm overflow-hidden"
                  >
                    <span
                      className={`text-xs mt-1 ${
                        dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""
                      }`}
                    >
                      {dayNum}
                    </span>
                    <div className={`flex-1 flex ${hasMultipleSlots ? "flex-col" : "items-center"} gap-0.5 p-0.5 w-full`}>
                      {slots.map((slot) => {
                        const request = dateRequests[slot];
                        return (
                          <button
                            key={slot}
                            disabled={isLocked}
                            onClick={() => toggleRequest(day.date, slot)}
                            className={`flex-1 rounded text-xs flex flex-col items-center justify-center transition-colors ${
                              request === "available"
                                ? "bg-green-500 text-white"
                                : request === "conditional"
                                ? "bg-yellow-500 text-white"
                                : request === "unavailable"
                                ? "bg-red-500 text-white"
                                : "bg-white/50 hover:bg-white/80"
                            }`}
                          >
                            {hasMultipleSlots && (
                              <span className="text-[10px] opacity-70">{slotLabels[slot]}</span>
                            )}
                            <span>
                              {request === "available" ? "○" : request === "conditional" ? "△" : request === "unavailable" ? "×" : "-"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 凡例 */}
          <div className="flex justify-center gap-3 text-sm mb-4 flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span>○ 出勤可</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-yellow-500 rounded" />
              <span>△ 微妙</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-red-500 rounded" />
              <span>× 不可</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <span>休診日</span>
            </div>
          </div>

          {/* 操作ボタン */}
          {!isLocked && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={setAllAvailable}
                className="flex-1 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm"
              >
                全営業日を○
              </button>
              <button
                onClick={clearAll}
                className="flex-1 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm"
              >
                クリア
              </button>
            </div>
          )}

          {/* 保存ボタン */}
          {!isLocked && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50"
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          )}
        </>
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
