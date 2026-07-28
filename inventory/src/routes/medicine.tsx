import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { InventoryCheckList } from "@/components/InventoryCheckList";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/medicine",
  component: MedicinePage,
});

function MedicinePage() {
  return (
    <InventoryCheckList
      title="医薬品チェック"
      categoryId={1}
      notice="開封済みの在庫から使用する！！！新しく箱を開封した場合は必ず期限を更新する！！！"
      showExpiry={true}
    />
  );
}
