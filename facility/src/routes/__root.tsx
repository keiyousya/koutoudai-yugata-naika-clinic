import { createRootRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isLoggedIn, staffName, logout } = useAuthStore();
  const location = useLocation();
  const isLoginPage = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold hover:opacity-80">
              院内設備管理
            </Link>
            {isLoggedIn && !isLoginPage && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{staffName}</span>
                <button
                  onClick={logout}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
          {isLoggedIn && !isLoginPage && (
            <nav className="mt-2 flex gap-4">
              <Link
                to="/temperature"
                className={`text-sm hover:text-primary ${
                  location.pathname === "/temperature" ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                温度記録
              </Link>
              <Link
                to="/history"
                className={`text-sm hover:text-primary ${
                  location.pathname === "/history" ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                記録履歴
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
