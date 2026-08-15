import type { CreateTicketRequest } from "@inbot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi, type ApiDependencies } from "./app.js";

const ticketId = "8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2";
const createdAt = new Date("2026-08-14T12:00:00.000Z");

describe("POST /tickets", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("creates an open Ticket with a pending processing status", async () => {
    const createTicketWithProcessingIntent = vi.fn(
      async (command: {
        ticketId: string;
        idempotencyKey: string;
        ticket: CreateTicketRequest;
      }) => ({
        kind: "created" as const,
        ticket: {
          id: command.ticketId,
          ...command.ticket,
          status: "open" as const,
          processingStatus: "pending" as const,
          slaDueAt: null,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        },
      }),
    );
    const dependencies: ApiDependencies = {
      tickets: { createTicketWithProcessingIntent },
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/tickets",
      headers: { "idempotency-key": "create-001" },
      payload: {
        title: "  Acesso ao sistema indisponível  ",
        description:
          "  O operador não consegue acessar o sistema desde as 09:00.  ",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.json()).toEqual({
      id: ticketId,
      title: "Acesso ao sistema indisponível",
      description: "O operador não consegue acessar o sistema desde as 09:00.",
      requesterEmail: "operador@example.com",
      priority: "high",
      status: "open",
      processingStatus: "pending",
      slaDueAt: null,
      version: 1,
      createdAt: "2026-08-14T12:00:00.000Z",
      updatedAt: "2026-08-14T12:00:00.000Z",
    });
    expect(createTicketWithProcessingIntent).toHaveBeenCalledWith({
      ticketId,
      idempotencyKey: "create-001",
      ticket: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });
  });
});
