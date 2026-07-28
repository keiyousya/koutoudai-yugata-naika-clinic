import { createRootRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, staffName, logout, restore } = useAuthStore();
  const isLoginPage = location.pathname === "/login";

  useEffect(() => {
    if (!isLoggedIn) {
      restore();
    }
  }, [isLoggedIn, restore]);

  useEffect(() => {
    if (!isLoggedIn && !isLoginPage) {
      const hasSession = sessionStorage.getItem("inventory_auth");
      if (!hasSession) {
        navigate({ to: "/login" });
      }
    }
  }, [isLoggedIn, isLoginPage, navigate]);

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <span className="text-xl font-bold">在庫管理</span>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">
          <Outlet />
        </main>
      </div>
    );
  }

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
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold hover:opacity-80">
              在庫管理
            </Link>
            {isLoggedIn && (
              <div className="flex items-center gap-3">
                {staffName && (
                  <span className="text-sm text-muted-foreground">
                    {staffName}
                  </span>
                )}
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
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
