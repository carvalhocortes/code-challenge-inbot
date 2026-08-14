import { describe, expect, it } from "vitest";

import {
  changeTicketPriority,
  transitionTicketStatus,
  type Ticket,
} from "./ticket.js";

const updatedAt = new Date("2026-08-17T13:15:00.000Z");

describe("transitionTicketStatus", () => {
  it("moves an open Ticket to in progress and increments its version", () => {
    const result = transitionTicketStatus(
      ticket({ status: "open", version: 3 }),
      "in_progress",
      { now: () => updatedAt },
    );

    expect(result).toEqual({
      kind: "changed",
      previousStatus: "open",
      ticket: expect.objectContaining({
        status: "in_progress",
        version: 4,
        updatedAt,
      }),
    });
  });

  it.each([
    ["open", "in_progress"],
    ["in_progress", "resolved"],
    ["resolved", "in_progress"],
    ["resolved", "closed"],
  ] as const)("allows %s to %s", (status, nextStatus) => {
    const result = transitionTicketStatus(ticket({ status }), nextStatus, {
      now: () => updatedAt,
    });

    expect(result).toMatchObject({
      kind: "changed",
      previousStatus: status,
      ticket: { status: nextStatus },
    });
  });

  it("rejects an invalid status transition without changing the Ticket", () => {
    const originalTicket = ticket({ status: "open" });

    expect(() =>
      transitionTicketStatus(originalTicket, "closed", {
        now: () => updatedAt,
      }),
    ).toThrow("ticket.status_transition_invalid");
    expect(originalTicket.status).toBe("open");
  });

  it("returns a no-op when the requested status is already current", () => {
    const originalTicket = ticket({ status: "in_progress" });

    expect(
      transitionTicketStatus(originalTicket, "in_progress", {
        now: () => updatedAt,
      }),
    ).toEqual({ kind: "noop", ticket: originalTicket });
  });
});

describe("changeTicketPriority", () => {
  it("marks processing as pending and increments the version", () => {
    const result = changeTicketPriority(
      ticket({ priority: "medium", processingStatus: "processed", version: 3 }),
      "high",
      { now: () => updatedAt },
    );

    expect(result).toEqual({
      kind: "changed",
      previousPriority: "medium",
      ticket: expect.objectContaining({
        priority: "high",
        processingStatus: "pending",
        version: 4,
        updatedAt,
      }),
    });
  });

  it("rejects a priority change for a closed Ticket", () => {
    const originalTicket = ticket({ status: "closed", priority: "medium" });

    expect(() =>
      changeTicketPriority(originalTicket, "high", { now: () => updatedAt }),
    ).toThrow("ticket.closed");
    expect(originalTicket.priority).toBe("medium");
  });

  it("returns a no-op when the priority is already current", () => {
    const originalTicket = ticket({ priority: "high" });

    expect(
      changeTicketPriority(originalTicket, "high", { now: () => updatedAt }),
    ).toEqual({
      kind: "noop",
      ticket: originalTicket,
    });
  });
});

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2",
    title: "Acesso ao sistema indisponível",
    description: "O operador não consegue acessar o sistema desde as 09:00.",
    requesterEmail: "operador@example.com",
    priority: "medium",
    status: "open",
    processingStatus: "pending",
    slaDueAt: null,
    version: 1,
    createdAt: new Date("2026-08-17T13:00:00.000Z"),
    updatedAt: new Date("2026-08-17T13:00:00.000Z"),
    ...overrides,
  };
}
