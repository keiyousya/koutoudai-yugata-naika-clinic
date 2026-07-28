import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Route as rootRoute } from "./__root";
import { fetchItems, fetchExpiry, fetchOrders } from "@/api/inventory";
import type { ExpiryRecord, OrderRecord } from "@/api/inventory";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, ShoppingCart, Clock } from "lucide-react";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

function DashboardPage() {
  const { data: items } = useQuery({
    queryKey: ["items"],
    queryFn: () => fetchItems(),
  });

  const { data: expiry } = useQuery({
    queryKey: ["expiry"],
    queryFn: () => fetchExpiry(),
  });

  const { data: orders } = useQuery({
    queryKey: ["orders-pending"],
    queryFn: () => fetchOrders("pending"),
  });

  const today = new Date().toISOString().slice(0, 10);

  // 期限切れ・期限間近の品目
  const expiringItems = (expiry ?? []).filter((e: ExpiryRecord) => {
    const monthsAway =
      (new Date(e.expiry_date).getTime() - new Date(today).getTime()) /
      (1000 * 60 * 60 * 24 * 30);
    return monthsAway <= 3;
  });

  const expiredItems = expiringItems.filter(
    (e: ExpiryRecord) => e.expiry_date <= today
  );
  const soonExpiring = expiringItems.filter(
    (e: ExpiryRecord) => e.expiry_date > today
  );

  const pendingOrders = orders ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">管理品目数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items?.length ?? "-"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">期限注意</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {soonExpiring.length}
            </div>
            {expiredItems.length > 0 && (
              <p className="text-xs text-destructive mt-1">
                {expiredItems.length}件が期限切れ
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">未発注</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders.length}</div>
          </CardContent>
        </Card>
      </div>

      {(expiredItems.length > 0 || soonExpiring.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              期限注意品目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiredItems.map((e: ExpiryRecord) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                >
                  <div>
                    <span className="font-medium">{e.item_name}</span>
                    {e.dosage && (
                      <span className="ml-1 text-sm text-muted-foreground">
                        {e.dosage}
                      </span>
                    )}
                  </div>
                  <Badge variant="destructive">
                    期限切れ: {e.expiry_date}
                  </Badge>
                </div>
              ))}
              {soonExpiring.map((e: ExpiryRecord) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                  <div>
                    <span className="font-medium">{e.item_name}</span>
                    {e.dosage && (
                      <span className="ml-1 text-sm text-muted-foreground">
                        {e.dosage}
                      </span>
                    )}
                  </div>
                  <Badge variant="warning">期限: {e.expiry_date}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              未発注リスト
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingOrders.map((o: OrderRecord) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <span className="font-medium">{o.item_name}</span>
                    {o.dosage && (
                      <span className="ml-1 text-sm text-muted-foreground">
                        {o.dosage}
                      </span>
                    )}
                    <span className="ml-2 text-sm">
                      {o.quantity} {o.unit}
                    </span>
                  </div>
                  <Badge variant="outline">未発注</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
