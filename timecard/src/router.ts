import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as historyRoute } from "./routes/history";
import { Route as adminRoute } from "./routes/admin";

const routeTree = rootRoute.addChildren([indexRoute, historyRoute, adminRoute]);

export const router = createRouter({
  routeTree,
  basepath: "/timecard",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
