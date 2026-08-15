import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketDetailPage } from "../../detail/ui/page";
import { NewTicketPage } from "./page";

const ticket = {
  id: "d2719f2f-aea0-4814-a168-ae5f3a0f3bb9",
  title: "Acesso indisponível",
  description: "A operadora não consegue acessar o sistema.",
  requesterEmail: "operadora@example.com",
  priority: "high",
  status: "open",
  processingStatus: "pending",
  slaDueAt: null,
  version: 1,
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T12:00:00.000Z",
} as const;

describe("criação de Ticket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia uma chave de idempotência e mostra o processamento no detalhe criado", async () => {
    const fetchTicketApi = vi.fn((url: URL | string, init?: RequestInit) => {
      if (String(url).endsWith("/tickets") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(ticket, 201, { ETag: '"1"' }));
      }

      return Promise.resolve(jsonResponse({ ...ticket, history: [] }));
    });
    vi.stubGlobal("fetch", fetchTicketApi);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/tickets/new"]}>
          <Routes>
            <Route path="/tickets/new" element={<NewTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByLabelText("Título"), ticket.title);
    await userEvent.type(
      screen.getByLabelText("Descrição"),
      ticket.description,
    );
    await userEvent.type(
      screen.getByLabelText("E-mail do solicitante"),
      ticket.requesterEmail,
    );
    await userEvent.selectOptions(screen.getByLabelText("Prioridade"), "high");
    await userEvent.click(screen.getByRole("button", { name: "Criar ticket" }));

    await waitFor(() => {
      expect(screen.getByText("Aguardando cálculo")).toBeVisible();
    });

    const [, request] = fetchTicketApi.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({
      "Idempotency-Key": expect.stringMatching(/.+/),
    });
  });
});

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });
}
