import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as requestRoute } from "./routes/request";
import { Route as viewRoute } from "./routes/view";
import { Route as adminIndexRoute } from "./routes/admin/index";
import { Route as adminStaffRoute } from "./routes/admin/staff";
import { Route as adminCalendarRoute } from "./routes/admin/calendar";
import { Route as adminRequestsRoute } from "./routes/admin/requests";
import { Route as adminEditorRoute } from "./routes/admin/editor";

const routeTree = rootRoute.addChildren([
  indexRoute,
  requestRoute,
  viewRoute,
  adminIndexRoute,
  adminStaffRoute,
  adminCalendarRoute,
  adminRequestsRoute,
  adminEditorRoute,
]);

const basepath = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
