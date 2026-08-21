import { createRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Route as rootRoute } from "./__root";
import {
  fetchItems,
  fetchRecords,
  updateItemOrderSettings,
} from "@/api/inventory";
import type { InventoryItem, InventoryRecord } from "@/api/inventory";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ClipboardList, Settings } from "lucide-react";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  component: OrdersPage,
});

function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** 「箱数」→「箱」のように単位の表記を発注文面用に整える */
function orderUnitLabel(unit: string | null) {
  if (unit && unit.endsWith("数")) return unit.slice(0, -1);
  return "箱";
}

interface OrderLine {
  item: InventoryItem;
  currentStock: number;
  threshold: number;
  orderQuantity: number;
}

function OrdersPage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const currentMonth = formatMonth(today);
  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const emailSubject = "薬の注文のお願い（勾当台夕方内科　田村）";

  const { data: allItems } = useQuery({
    queryKey: ["items"],
    queryFn: () => fetchItems(),
  });

  const items = allItems ?? [];

  // 発注対象の品目（画面から設定可能）
  const orderableItems = useMemo(
    () => items.filter((i: InventoryItem) => i.is_orderable === 1),
    [items]
  );

  const { data: records } = useQuery({
    queryKey: ["records", currentMonth, "all"],
    queryFn: () => fetchRecords(currentMonth),
  });

  const settingsMutation = useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: number;
      data: { order_threshold?: number; is_orderable?: number };
    }) => updateItemOrderSettings(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  // 各品目の最新在庫（当月の最も新しい日付のレコード）
  const latestStockMap = useMemo(() => {
    const map = new Map<number, { quantity: number | null; date: string }>();
    (records ?? []).forEach((r: InventoryRecord) => {
      const existing = map.get(r.item_id);
      if (!existing || r.date > existing.date) {
        map.set(r.item_id, { quantity: r.quantity, date: r.date });
      }
    });
    return map;
  }, [records]);

  // 発注が必要な品目を算出
  const orderLines = useMemo(() => {
    return orderableItems
      .map((item): OrderLine | null => {
        const latest = latestStockMap.get(item.id);
        const currentStock = latest?.quantity ?? null;
        const threshold = item.order_threshold;

        if (currentStock === null || currentStock >= threshold) return null;

        return {
          item,
          currentStock,
          threshold,
          orderQuantity: threshold - currentStock,
        };
      })
      .filter((line): line is OrderLine => line !== null);
  }, [orderableItems, latestStockMap]);

  // メール文面生成
  const emailText = useMemo(() => {
    if (orderLines.length === 0) return "";

    const lines = [
      "東邦薬品株式会社",
      "中野様",
      "",
      "いつも大変お世話になっております。",
      "勾当台夕方内科の田村です。",
      "",
      "下記の注文をお願いいたします。",
      ...orderLines.map(
        (line) =>
          `・${line.item.name}${line.item.dosage && line.item.dosage !== "-" ? line.item.dosage : ""} ${line.orderQuantity}${orderUnitLabel(line.item.unit)}`
      ),
      "",
      "また、火曜日は休診のため不在となっております。",
      "お手数をおかけして恐縮ですが、納品は水曜日以降にご手配いただけますと幸いです。",
      "",
      "引き続きよろしくお願いいたします。",
      "",
      "勾当台夕方内科クリニック",
      "田村さつき",
    ];

    return lines.join("\n");
  }, [orderLines]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 最新記録日（発注対象品目のみ）
  const latestDate = useMemo(() => {
    let latest = "";
    orderableItems.forEach((item: InventoryItem) => {
      const d = latestStockMap.get(item.id)?.date;
      if (d && d > latest) latest = d;
    });
    return latest;
  }, [orderableItems, latestStockMap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">発注管理</h1>
        <div className="flex items-center gap-3">
          {latestDate && (
            <span className="text-sm text-muted-foreground">
              最新在庫: {latestDate}時点
            </span>
          )}
          <Button
            variant={showSettings ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSettings((v) => !v)}
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            発注設定
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        品目ごとの規定量に満たない品目を自動検出します。規定量と発注対象は「発注設定」から変更できます。
      </p>

      {/* 発注設定 */}
      {showSettings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              発注設定
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-3 pb-3">
              <p className="py-2 text-xs text-muted-foreground">
                チェックを入れた品目が発注管理の対象になります。規定量は品目ごとに設定できます。
              </p>
              <div className="space-y-1">
                {items.map((item: InventoryItem, index: number) => {
                  const prev = index > 0 ? items[index - 1] : null;
                  const showCategory =
                    !prev || prev.category_id !== item.category_id;
                  const isOrderable = item.is_orderable === 1;

                  return (
                    <div key={item.id}>
                      {showCategory && (
                        <div className="px-1 pt-3 pb-1 text-xs font-bold text-muted-foreground">
                          {item.category_name}
                        </div>
                      )}
                      <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={isOrderable}
                          onChange={(e) =>
                            settingsMutation.mutate({
                              itemId: item.id,
                              data: { is_orderable: e.target.checked ? 1 : 0 },
                            })
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm ${isOrderable ? "font-medium" : "text-muted-foreground"}`}
                          >
                            {item.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {item.dosage && item.dosage !== "-"
                              ? item.dosage
                              : ""}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            規定量
                          </span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            disabled={!isOrderable}
                            className="w-16 h-10 rounded-md border border-input bg-background text-center text-base disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            key={`threshold-${item.id}-${item.order_threshold}`}
                            defaultValue={item.order_threshold}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (
                                Number.isNaN(value) ||
                                value < 0 ||
                                value === item.order_threshold
                              ) {
                                e.target.value = String(item.order_threshold);
                                return;
                              }
                              settingsMutation.mutate({
                                itemId: item.id,
                                data: { order_threshold: value },
                              });
                            }}
                          />
                          <span className="w-8 text-xs text-muted-foreground">
                            {orderUnitLabel(item.unit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 在庫状況一覧 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            在庫状況
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-1 p-3">
            {orderableItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                発注対象の品目がありません。「発注設定」から選択してください。
              </p>
            )}
            {orderableItems.map((item: InventoryItem, index: number) => {
              const latest = latestStockMap.get(item.id);
              const stock = latest?.quantity;
              const threshold = item.order_threshold;
              const isLow = stock != null && stock < threshold;
              const noData = stock == null;
              const prev = index > 0 ? orderableItems[index - 1] : null;
              const showCategory =
                !!prev && prev.category_id !== item.category_id;

              return (
                <div key={item.id}>
                  {showCategory && (
                    <div className="px-1 pt-3 pb-1 text-xs font-bold text-muted-foreground">
                      {item.category_name}
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      isLow ? "bg-red-50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {item.dosage || ""}
                      </span>
                    </div>
                    <div className="shrink-0 w-16 text-right text-sm">
                      {noData ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className={isLow ? "text-red-600 font-bold" : ""}>
                          {stock}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-0.5">
                        / {threshold}
                      </span>
                    </div>
                    <div className="shrink-0 w-16">
                      {isLow && (
                        <Badge variant="destructive" className="text-[10px]">
                          要発注
                        </Badge>
                      )}
                      {!isLow && !noData && (
                        <Badge variant="success" className="text-[10px]">
                          OK
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* メール文面 */}
      {orderLines.length > 0 ? (
        <div className="space-y-4">
          {/* 件名 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">件名</CardTitle>
                <Button
                  variant={copiedSubject ? "default" : "outline"}
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(emailSubject);
                    setCopiedSubject(true);
                    setTimeout(() => setCopiedSubject(false), 2000);
                  }}
                >
                  {copiedSubject ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      コピー
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted p-3 text-sm">
                {emailSubject}
              </div>
            </CardContent>
          </Card>

          {/* 本文 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">本文</CardTitle>
                <Button
                  variant={copied ? "default" : "outline"}
                  size="sm"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      コピー
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed">
                {emailText}
              </pre>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {latestDate
              ? "すべての品目が規定量を満たしています。発注不要です。"
              : "在庫データがありません。在庫チェックを先に行ってください。"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
