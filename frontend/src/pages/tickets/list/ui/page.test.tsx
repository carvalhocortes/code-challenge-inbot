import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketListPage } from "./page";

describe("central de Tickets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consulta os filtros da URL e torna o processamento visível", async () => {
    const fetchTicketApi = vi.fn<
      (url: URL | string, init?: RequestInit) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "d2719f2f-aea0-4814-a168-ae5f3a0f3bb9",
                title: "Acesso indisponível",
                description: "A operadora não consegue acessar o sistema.",
                requesterEmail: "operadora@example.com",
                priority: "high",
                status: "open",
                processingStatus: "processing",
                slaDueAt: "2026-08-17T16:00:00.000Z",
                version: 1,
                createdAt: "2026-08-15T12:00:00.000Z",
                updatedAt: "2026-08-15T12:00:00.000Z",
              },
            ],
            meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchTicketApi);

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter
          initialEntries={[
            "/tickets?page=2&q=acesso&status=open&priority=high",
          ]}
        >
          <TicketListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Em processamento")).toBeVisible();
    expect(screen.getByText("Página 2 de 2")).toBeVisible();
    expect(screen.getByText("17/08/2026, 13:00")).toBeVisible();

    await waitFor(() => {
      expect(String(fetchTicketApi.mock.calls[0]?.[0])).toContain(
        "page=2&pageSize=10&q=acesso&status=open&priority=high",
      );
    });
  });
});
