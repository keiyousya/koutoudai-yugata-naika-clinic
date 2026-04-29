import { createRootRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isLoggedIn, logout } = useAuthStore();
  const location = useLocation();
  const isLoginPage = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold hover:opacity-80">
              シフト管理
            </Link>
            {isLoggedIn && !isLoginPage && (
              <button
                onClick={logout}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ログアウト
              </button>
            )}
          </div>
          {isLoggedIn && !isLoginPage && (
            <nav className="mt-2 flex gap-4">
              <Link
                to="/request"
                className={`text-sm hover:text-primary ${
                  location.pathname === "/request" ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                希望提出
              </Link>
              <Link
                to="/view"
                className={`text-sm hover:text-primary ${
                  location.pathname === "/view" ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                シフト確認
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
