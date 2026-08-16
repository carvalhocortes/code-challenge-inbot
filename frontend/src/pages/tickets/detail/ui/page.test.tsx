import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TicketDetailPage } from "./page";

const ticketId = "d2719f2f-aea0-4814-a168-ae5f3a0f3bb9";

const ticketDetail = {
  id: ticketId,
  title: "Acesso crítico ao sistema",
  description: "A operação principal está indisponível para a equipe.",
  requesterEmail: "operadora@example.com",
  priority: "critical" as const,
  status: "open" as const,
  processingStatus: "failed" as const,
  slaDueAt: "2026-08-17T16:00:00.000Z",
  slaStatus: "critical" as const,
  slaRemainingMs: 60 * 60 * 1000,
  version: 3,
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T12:05:00.000Z",
  history: [
    {
      id: "7c0adf91-d85a-405c-b023-535f3b9f8688",
      type: "priority_changed" as const,
      previousValue: "high",
      nextValue: "critical",
      source: "operator" as const,
      createdAt: "2026-08-15T12:05:00.000Z",
    },
    {
      id: "d2c4f5df-7763-4e0c-bdf7-d16c38ca7a59",
      type: "created" as const,
      previousValue: null,
      nextValue: null,
      source: "system" as const,
      createdAt: "2026-08-15T12:00:00.000Z",
    },
  ],
};

describe("detalhe do Ticket", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra SLA, solicitante, ações e histórico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(ticketDetail)),
    );

    renderTicketDetail();

    expect(
      await screen.findByRole("heading", { name: ticketDetail.title }),
    ).toBeVisible();
    expect(screen.getByText("17/08/2026, 13:00")).toBeVisible();
    expect(screen.getByText(ticketDetail.requesterEmail)).toBeVisible();
    expect(screen.getByText("Reprocessar SLA")).toBeVisible();
    expect(screen.getByText("Prioridade: Alta → Crítica")).toBeVisible();
    expect(screen.getByText("Ticket criado")).toBeVisible();
  });

  it("envia o If-Match ao alterar o status", async () => {
    const user = userEvent.setup();
    const fetchTicketApi = vi.fn((input: URL | string, init?: RequestInit) => {
      if (String(input).endsWith("/status")) {
        return jsonResponse({
          ...ticketDetail,
          history: undefined,
          status: "in_progress",
        });
      }

      return jsonResponse(ticketDetail);
    });
    vi.stubGlobal("fetch", fetchTicketApi);

    renderTicketDetail();

    await screen.findByRole("heading", { name: ticketDetail.title });
    await user.selectOptions(
      screen.getByLabelText("Status de atendimento"),
      "in_progress",
    );
    await user.click(screen.getByRole("button", { name: "Atualizar status" }));

    await waitFor(() => {
      const statusRequest = fetchTicketApi.mock.calls.find(([input]) =>
        String(input).endsWith("/status"),
      );
      expect(statusRequest).toBeDefined();
      expect(statusRequest?.[1]).toMatchObject({
        body: JSON.stringify({ status: "in_progress" }),
        method: "PATCH",
      });
      expect(new Headers(statusRequest?.[1]?.headers).get("If-Match")).toBe(
        '"3"',
      );
    });
  });

  it("mantém o conflito visível e oferece recarregar o ticket", async () => {
    const user = userEvent.setup();
    const fetchTicketApi = vi.fn((input: URL | string) => {
      if (String(input).endsWith("/status")) {
        return jsonResponse(
          {
            code: "ticket.version_conflict",
            detail: "O Ticket foi alterado por outra operação.",
            requestId: "req-conflict",
            status: 412,
            title: "Ticket version conflict",
            type: "/problems/ticket-version-conflict",
          },
          412,
          "application/problem+json",
        );
      }

      return jsonResponse(ticketDetail);
    });
    vi.stubGlobal("fetch", fetchTicketApi);

    renderTicketDetail();

    await screen.findByRole("heading", { name: ticketDetail.title });
    await user.selectOptions(
      screen.getByLabelText("Status de atendimento"),
      "in_progress",
    );
    await user.click(screen.getByRole("button", { name: "Atualizar status" }));

    expect(
      await screen.findByRole("heading", {
        name: "Não foi possível concluir a ação",
      }),
    ).toBeVisible();
    expect(screen.getByText("req-conflict")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Recarregar ticket" }));

    await waitFor(() => {
      expect(
        fetchTicketApi.mock.calls.filter(([input]) =>
          String(input).endsWith(ticketId),
        ),
      ).toHaveLength(2);
    });
  });
});

function jsonResponse(
  body: unknown,
  status = 200,
  contentType = "application/json",
): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": contentType },
      status,
    }),
  );
}

function renderTicketDetail() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[`/tickets/${ticketId}`]}>
        <Routes>
          <Route element={<TicketDetailPage />} path="/tickets/:id" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
