import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { InventoryCheckList } from "@/components/InventoryCheckList";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/supplies",
  component: SuppliesPage,
});

function SuppliesPage() {
  return (
    <InventoryCheckList
      title="備品チェック"
      categoryId={2}
      showExpiry={false}
    />
  );
}
