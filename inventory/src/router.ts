import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as loginRoute } from "./routes/login";
import { Route as medicineRoute } from "./routes/medicine";
import { Route as suppliesRoute } from "./routes/supplies";
import { Route as ordersRoute } from "./routes/orders";

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  medicineRoute,
  suppliesRoute,
  ordersRoute,
]);

const basepath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
