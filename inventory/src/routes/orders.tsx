import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Route as rootRoute } from "./__root";
import { fetchItems, fetchRecords } from "@/api/inventory";
import type { InventoryItem, InventoryRecord } from "@/api/inventory";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ClipboardList } from "lucide-react";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  component: OrdersPage,
});

const DEFAULT_THRESHOLD = 5;

function formatMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

interface OrderLine {
  item: InventoryItem;
  currentStock: number | null;
  threshold: number;
  orderQuantity: number;
}

function OrdersPage() {
  const today = new Date();
  const currentMonth = formatMonth(today);
  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const emailSubject = "薬の注文のお願い（勾当台夕方内科　田村）";

  const MEDICINE_CATEGORY_ID = 1;

  const { data: allItems } = useQuery({
    queryKey: ["items"],
    queryFn: () => fetchItems(),
  });

  const items = (allItems ?? []).filter(
    (i: InventoryItem) => i.category_id === MEDICINE_CATEGORY_ID
  );

  const { data: records } = useQuery({
    queryKey: ["records", currentMonth, MEDICINE_CATEGORY_ID],
    queryFn: () => fetchRecords(currentMonth, MEDICINE_CATEGORY_ID),
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
    if (items.length === 0) return [];

    return items
      .map((item): OrderLine | null => {
        const latest = latestStockMap.get(item.id);
        const currentStock = latest?.quantity ?? null;
        const threshold = DEFAULT_THRESHOLD;

        if (currentStock === null || currentStock >= threshold) return null;

        const orderQuantity = threshold - currentStock;
        return { item, currentStock, threshold, orderQuantity };
      })
      .filter((line): line is OrderLine => line !== null);
  }, [items, latestStockMap]);

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
          `・${line.item.name}${line.item.dosage && line.item.dosage !== "-" ? line.item.dosage : ""} ${line.orderQuantity}箱`
      ),
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

  // 最新記録日
  const latestDate = useMemo(() => {
    let latest = "";
    latestStockMap.forEach((v) => {
      if (v.date > latest) latest = v.date;
    });
    return latest;
  }, [latestStockMap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">発注管理</h1>
        {latestDate && (
          <span className="text-sm text-muted-foreground">
            最新在庫: {latestDate}時点
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        規定量（{DEFAULT_THRESHOLD}箱）に満たない品目を自動検出します。
      </p>

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
            {items.map((item: InventoryItem) => {
              const latest = latestStockMap.get(item.id);
              const stock = latest?.quantity;
              const isLow = stock != null && stock < DEFAULT_THRESHOLD;
              const noData = stock == null;

              return (
                <div
                  key={item.id}
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
                      / {DEFAULT_THRESHOLD}
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
