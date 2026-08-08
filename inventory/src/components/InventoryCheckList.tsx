import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  fetchItems,
  fetchRecords,
  fetchLatestRecords,
  fetchExpiry,
  updateRecord,
  createExpiry,
  updateExpiry,
  deleteExpiry,
} from "@/api/inventory";
import type {
  InventoryItem,
  InventoryRecord,
  LatestRecord,
  ExpiryRecord,
} from "@/api/inventory";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Check, Minus, Plus } from "lucide-react";

/** 入力してから自動保存するまでの待ち時間（±連打を1リクエストにまとめる） */
const SAVE_DEBOUNCE_MS = 700;

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 2026-08-02 → 8/2 */
function formatShortDate(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function getExpiryStatus(expiryDate: string, today: string): "expired" | "warning" | "ok" {
  if (expiryDate <= today) return "expired";
  const monthsAway =
    (new Date(expiryDate).getTime() - new Date(today).getTime()) /
    (1000 * 60 * 60 * 24 * 30);
  return monthsAway <= 3 ? "warning" : "ok";
}

interface Props {
  title: string;
  categoryId: number;
  notice?: string;
  showExpiry?: boolean;
}

type SaveStatus = "saving" | "saved";

export function InventoryCheckList({ title, categoryId, notice, showExpiry = true }: Props) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const currentMonth = selectedDate.slice(0, 7);
  const today = formatDate(new Date());

  // 入力中の値（サーバーの値より優先して表示する）
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const { data: allItems } = useQuery({
    queryKey: ["items"],
    queryFn: () => fetchItems(),
  });

  const items = (allItems ?? []).filter(
    (i: InventoryItem) => i.category_id === categoryId
  );

  const { data: records } = useQuery({
    queryKey: ["records", currentMonth, categoryId],
    queryFn: () => fetchRecords(currentMonth, categoryId),
  });

  // 選択日より前の直近の記録（品目ごと）
  const { data: latestRecords } = useQuery({
    queryKey: ["records-latest", selectedDate, categoryId],
    queryFn: () => fetchLatestRecords(selectedDate, categoryId),
  });

  const { data: expiryData } = useQuery({
    queryKey: ["expiry"],
    queryFn: () => fetchExpiry(),
    enabled: showExpiry,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      itemId,
      date,
      quantity,
    }: {
      itemId: number;
      date: string;
      quantity: number | null;
    }) => updateRecord(itemId, date, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["records", currentMonth, categoryId] });
      queryClient.invalidateQueries({ queryKey: ["records-latest"] });
    },
  });

  const createExpiryMutation = useMutation({
    mutationFn: createExpiry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expiry"] });
    },
  });

  const updateExpiryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateExpiry>[1] }) =>
      updateExpiry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expiry"] });
    },
  });

  const deleteExpiryMutation = useMutation({
    mutationFn: deleteExpiry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expiry"] });
    },
  });

  // 当日のレコード
  const recordMap = new Map<number, number | null>();
  (records ?? []).forEach((r: InventoryRecord) => {
    if (r.date === selectedDate) {
      recordMap.set(r.item_id, r.quantity);
    }
  });

  // 保存判定は遅延実行時の最新値を見る必要があるため ref に持つ
  const recordMapRef = useRef(recordMap);
  recordMapRef.current = recordMap;

  // 直近の記録（選択日より前で最も新しいもの）
  const latestRecordMap = new Map<number, LatestRecord>();
  (latestRecords ?? []).forEach((r: LatestRecord) => {
    latestRecordMap.set(r.item_id, r);
  });

  // 使用期限: item_id → ExpiryRecord（最も近い期限を代表として表示）
  const expiryMap = new Map<number, ExpiryRecord>();
  if (showExpiry) {
    (expiryData ?? []).forEach((e: ExpiryRecord) => {
      const existing = expiryMap.get(e.item_id);
      if (!existing || e.expiry_date < existing.expiry_date) {
        expiryMap.set(e.item_id, e);
      }
    });
  }

  // 日付を切り替えたら入力中の値をリセット
  useEffect(() => {
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    setDrafts({});
    setSaveStatus({});
  }, [selectedDate]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const commit = useCallback(
    (itemId: number, raw: string) => {
      clearTimeout(saveTimers.current[itemId]);

      const quantity = raw === "" ? null : parseFloat(raw);
      if (quantity !== null && Number.isNaN(quantity)) return;

      const existing = recordMapRef.current.get(itemId);
      if (quantity === existing) return;
      if (quantity === null && existing == null) return;

      setSaveStatus((s) => ({ ...s, [itemId]: "saving" }));
      updateMutation.mutate(
        { itemId, date: selectedDate, quantity },
        {
          onSuccess: () => {
            setSaveStatus((s) => ({ ...s, [itemId]: "saved" }));
            setTimeout(() => {
              setSaveStatus((s) => {
                if (s[itemId] !== "saved") return s;
                const next = { ...s };
                delete next[itemId];
                return next;
              });
            }, 1500);
          },
          onError: () => {
            setSaveStatus((s) => {
              const next = { ...s };
              delete next[itemId];
              return next;
            });
          },
        }
      );
    },
    [selectedDate, updateMutation]
  );

  const scheduleSave = useCallback(
    (itemId: number, raw: string) => {
      clearTimeout(saveTimers.current[itemId]);
      saveTimers.current[itemId] = setTimeout(
        () => commit(itemId, raw),
        SAVE_DEBOUNCE_MS
      );
    },
    [commit]
  );

  const setValue = useCallback(
    (itemId: number, raw: string) => {
      setDrafts((d) => ({ ...d, [itemId]: raw }));
      scheduleSave(itemId, raw);
    },
    [scheduleSave]
  );

  const prevDay = useCallback(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatDate(d));
  }, [selectedDate]);

  const nextDay = useCallback(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(formatDate(d));
  }, [selectedDate]);

  const handleExpiryChange = useCallback(
    (itemId: number, value: string) => {
      const existing = expiryMap.get(itemId);
      if (!value) {
        if (existing) deleteExpiryMutation.mutate(existing.id);
        return;
      }
      if (existing) {
        if (value !== existing.expiry_date) {
          updateExpiryMutation.mutate({ id: existing.id, data: { expiry_date: value } });
        }
      } else {
        createExpiryMutation.mutate({ item_id: itemId, expiry_date: value });
      }
    },
    [expiryMap, createExpiryMutation, updateExpiryMutation, deleteExpiryMutation]
  );

  // 未入力の品目数（当日分）
  const unfilledCount = items.filter((item: InventoryItem) => {
    const draft = drafts[item.id];
    if (draft !== undefined) return draft === "";
    return recordMap.get(item.id) == null;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-base font-medium sm:flex-none"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {notice && (
        <p className="text-xs text-muted-foreground">{notice}</p>
      )}

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unfilledCount === 0
            ? `全${items.length}品目の記録が完了しています`
            : `未入力 ${unfilledCount} / ${items.length} 品目`}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          品目が登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: InventoryItem) => {
            const stored = recordMap.get(item.id);
            const draft = drafts[item.id];
            const inputValue =
              draft !== undefined ? draft : stored != null ? String(stored) : "";
            const numericValue = inputValue === "" ? null : parseFloat(inputValue);
            const latestRecord = latestRecordMap.get(item.id);
            const status = saveStatus[item.id];
            const expiry = expiryMap.get(item.id);
            const expiryStatus = expiry ? getExpiryStatus(expiry.expiry_date, today) : null;

            return (
              <div
                key={item.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  inputValue === "" ? "" : "border-primary/30 bg-primary/[0.03]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.dosage || "-"} / {item.unit}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-muted-foreground">
                      {latestRecord ? formatShortDate(latestRecord.date) : " "}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {latestRecord ? latestRecord.quantity : "-"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="1減らす"
                    disabled={numericValue === null || numericValue <= 0}
                    className="h-12 w-12 shrink-0 rounded-lg border border-input bg-background flex items-center justify-center active:bg-muted disabled:opacity-30"
                    onClick={() => {
                      const base = numericValue ?? 0;
                      setValue(item.id, String(Math.max(0, base - 1)));
                    }}
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="done"
                    placeholder="-"
                    className="h-12 flex-1 min-w-0 rounded-lg border border-input bg-background text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                    value={inputValue}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setValue(item.id, v);
                    }}
                    onBlur={(e) => commit(item.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="1増やす"
                    className="h-12 w-12 shrink-0 rounded-lg border border-input bg-background flex items-center justify-center active:bg-muted"
                    onClick={() => {
                      const base = numericValue ?? 0;
                      setValue(item.id, String(base + 1));
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <div className="w-5 shrink-0 text-center">
                    {status === "saving" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse" />
                    )}
                    {status === "saved" && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>

                {showExpiry && (
                  <div className="flex items-center gap-2 pl-0.5">
                    <span className="text-[10px] text-muted-foreground shrink-0">期限</span>
                    <input
                      type="month"
                      className={`h-9 rounded border px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                        expiryStatus === "expired"
                          ? "border-red-400 bg-red-50 text-red-700"
                          : expiryStatus === "warning"
                            ? "border-amber-400 bg-amber-50 text-amber-700"
                            : "border-input bg-background text-foreground"
                      }`}
                      defaultValue={expiry?.expiry_date ?? ""}
                      key={`expiry-${item.id}-${expiry?.id ?? "new"}`}
                      onBlur={(e) => handleExpiryChange(item.id, e.target.value)}
                    />
                    {expiry && (
                      <button
                        className="p-2 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteExpiryMutation.mutate(expiry.id)}
                        title="期限を削除"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {expiryStatus === "expired" && (
                      <span className="text-[10px] font-semibold text-red-600">期限切れ</span>
                    )}
                    {expiryStatus === "warning" && (
                      <span className="text-[10px] font-semibold text-amber-600">期限間近</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
