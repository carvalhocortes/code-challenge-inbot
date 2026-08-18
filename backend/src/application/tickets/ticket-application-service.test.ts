import { describe, expect, it, vi } from "vitest";

import type {
  CreateTicketResult,
  TicketCommandRepository,
  TicketQueryRepository,
} from "./contracts.js";
import { TicketApplicationService } from "./ticket-application-service.js";

describe("TicketApplicationService", () => {
  it("generates the Ticket ID inside the application boundary", async () => {
    const ticketId = "8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2";
    const result = {
      kind: "created" as const,
      ticket: {
        id: ticketId,
        title: "Acesso ao sistema",
        description: "O operador não consegue acessar o sistema.",
        requesterEmail: "operador@example.com",
        priority: "high" as const,
        status: "open" as const,
        processingStatus: "pending" as const,
        slaDueAt: null,
        version: 1,
        createdAt: new Date("2026-08-18T12:00:00.000Z"),
        updatedAt: new Date("2026-08-18T12:00:00.000Z"),
      },
    } satisfies CreateTicketResult;
    const create = vi.fn(async () => result);
    const commands = {
      createTicketWithProcessingIntent: create,
    } as unknown as TicketCommandRepository;
    const queries = {} as TicketQueryRepository;
    const service = new TicketApplicationService(
      commands,
      queries,
      () => ticketId,
    );

    await expect(
      service.createTicketWithProcessingIntent({
        idempotencyKey: "create-001",
        ticket: {
          title: "Acesso ao sistema",
          description: "O operador não consegue acessar o sistema.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      }),
    ).resolves.toBe(result);

    expect(create).toHaveBeenCalledWith({
      ticketId,
      idempotencyKey: "create-001",
      ticket: {
        title: "Acesso ao sistema",
        description: "O operador não consegue acessar o sistema.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });
  });
});
