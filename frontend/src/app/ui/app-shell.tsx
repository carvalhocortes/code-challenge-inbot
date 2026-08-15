import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const apiReadiness = useQuery({
    queryFn: async () => {
      const baseUrl =
        import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
      const response = await fetch(new URL("/health/ready", baseUrl));
      if (!response.ok) throw new Error("API indisponível");
    },
    queryKey: ["api-readiness"],
    refetchInterval: 30_000,
    retry: false,
  });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <div className="app-header-content">
          <Link
            aria-label="InBot, ir para tickets"
            className="brand-mark"
            to="/tickets"
          >
            <span aria-hidden="true" className="brand-orbit" />
            <span>InBot</span>
            <small>Centro de tickets</small>
          </Link>
          <nav aria-label="Navegação principal">
            <Link to="/tickets">Tickets</Link>
          </nav>
          <ApiReadiness status={apiReadiness.status} />
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}

function ApiReadiness({ status }: { status: "pending" | "error" | "success" }) {
  const label =
    status === "success"
      ? "API disponível"
      : status === "error"
        ? "API indisponível"
        : "Verificando API";

  return (
    <p className={`api-status api-status-${status}`}>
      <span aria-hidden="true" />
      {label}
    </p>
  );
}
