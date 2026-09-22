import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as temperatureRoute } from "./routes/temperature";
import { Route as historyRoute } from "./routes/history";

const routeTree = rootRoute.addChildren([
  indexRoute,
  temperatureRoute,
  historyRoute,
]);

const basepath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
