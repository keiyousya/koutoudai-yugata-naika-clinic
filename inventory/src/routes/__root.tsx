import { createRootRoute, Link, Outlet, useLocation } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();

  const navItems = [
    { to: "/" as const, label: "ダッシュボード", exact: true },
    { to: "/medicine" as const, label: "医薬品" },
    { to: "/supplies" as const, label: "備品" },
    { to: "/orders" as const, label: "発注管理" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="text-xl font-bold hover:opacity-80">
            在庫管理
          </Link>
          <nav className="mt-2 flex gap-4">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`text-sm hover:text-primary ${
                  (item.exact
                    ? location.pathname === "/" || location.pathname === ""
                    : location.pathname.startsWith(item.to))
                    ? "text-primary font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
