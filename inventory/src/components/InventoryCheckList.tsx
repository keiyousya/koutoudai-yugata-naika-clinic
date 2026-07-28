import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  fetchItems,
  fetchRecords,
  fetchExpiry,
  updateRecord,
  createExpiry,
  updateExpiry,
  deleteExpiry,
} from "@/api/inventory";
import type { InventoryItem, InventoryRecord, ExpiryRecord } from "@/api/inventory";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPrevDate(dateStr: string) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
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

export function InventoryCheckList({ title, categoryId, notice, showExpiry = true }: Props) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const currentMonth = selectedDate.slice(0, 7);
  const prevDate = getPrevDate(selectedDate);
  const prevMonth = prevDate.slice(0, 7);
  const today = formatDate(new Date());

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

  const { data: prevMonthRecords } = useQuery({
    queryKey: ["records", prevMonth, categoryId],
    queryFn: () => fetchRecords(prevMonth, categoryId),
    enabled: prevMonth !== currentMonth,
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

  // 前日のレコード
  const prevRecordMap = new Map<number, number | null>();
  const prevSource = prevMonth === currentMonth ? records : prevMonthRecords;
  (prevSource ?? []).forEach((r: InventoryRecord) => {
    if (r.date === prevDate) {
      prevRecordMap.set(r.item_id, r.quantity);
    }
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

  const handleBlur = useCallback(
    (itemId: number, value: string) => {
      const quantity = value === "" ? null : parseFloat(value);
      const existing = recordMap.get(itemId);

      if (quantity === existing) return;
      if (quantity === null && existing === undefined) return;

      updateMutation.mutate({ itemId, date: selectedDate, quantity });
    },
    [selectedDate, recordMap, updateMutation]
  );

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
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium sm:flex-none"
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

      {items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          品目が登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: InventoryItem) => {
            const value = recordMap.get(item.id);
            const prevValue = prevRecordMap.get(item.id);
            const expiry = expiryMap.get(item.id);
            const expiryStatus = expiry ? getExpiryStatus(expiry.expiry_date, today) : null;

            return (
              <div
                key={item.id}
                className="rounded-lg border p-3 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.dosage || "-"} / {item.unit}
                    </div>
                  </div>
                  <div className="text-center shrink-0 w-12">
                    <div className="text-[10px] text-muted-foreground">前日</div>
                    <div className="text-sm text-muted-foreground">
                      {prevValue != null ? prevValue : "-"}
                    </div>
                  </div>
                  <input
                    type="number"
                    className="w-16 h-10 shrink-0 rounded-md border border-input bg-background text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    defaultValue={value ?? ""}
                    key={`${item.id}-${selectedDate}`}
                    onBlur={(e) => handleBlur(item.id, e.target.value)}
                    inputMode="decimal"
                    placeholder="-"
                  />
                </div>
                {showExpiry && (
                  <div className="flex items-center gap-2 pl-0.5">
                    <span className="text-[10px] text-muted-foreground shrink-0">期限</span>
                    <input
                      type="month"
                      className={`h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
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
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteExpiryMutation.mutate(expiry.id)}
                        title="期限を削除"
                      >
                        <X className="h-3.5 w-3.5" />
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
