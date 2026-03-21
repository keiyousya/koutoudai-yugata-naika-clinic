import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Nfc } from "lucide-react";
import { NfcProvider } from "@/hooks/NfcContext";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <NfcProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold hover:opacity-80">
              <Nfc className="h-5 w-5" />
              タイムカード
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link
                to="/"
                className="hover:text-foreground text-muted-foreground [&.active]:text-foreground [&.active]:font-medium"
                activeProps={{ className: "active" }}
                activeOptions={{ exact: true }}
              >
                打刻
              </Link>
              <Link
                to="/history"
                className="hover:text-foreground text-muted-foreground [&.active]:text-foreground [&.active]:font-medium"
                activeProps={{ className: "active" }}
              >
                履歴
              </Link>
              <Link
                to="/admin"
                className="hover:text-foreground text-muted-foreground [&.active]:text-foreground [&.active]:font-medium"
                activeProps={{ className: "active" }}
              >
                管理
              </Link>
            </nav>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">
          <Outlet />
        </main>
      </div>
    </NfcProvider>
  );
}
