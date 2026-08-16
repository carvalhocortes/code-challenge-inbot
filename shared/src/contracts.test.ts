import { describe, expect, it } from "vitest";

import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  problemDetailsSchema,
  ticketSlaJobSchema,
} from "./contracts.js";

describe("createTicketRequestSchema", () => {
  it("accepts and normalizes a valid ticket creation request", () => {
    const result = createTicketRequestSchema.safeParse({
      title: "  Acesso ao sistema indisponível  ",
      description:
        "  O operador não consegue acessar o sistema desde as 09:00.  ",
      requesterEmail: "operador@example.com",
      priority: "high",
    });

    expect(result).toEqual({
      success: true,
      data: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });
  });
});

describe("ticketSlaJobSchema", () => {
  it("rejects personal data outside the deterministic processing payload", () => {
    const result = ticketSlaJobSchema.safeParse({
      ticketId: "8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2",
      processingVersion: 3,
      requesterEmail: "operador@example.com",
    });

    expect(result.success).toBe(false);
  });
});

describe("HTTP transport schemas", () => {
  it("applies pagination defaults and validates public problem details", () => {
    expect(listTicketsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(
      listTicketsQuerySchema.parse({
        slaStatus: "critical",
        slaSort: "remaining_asc",
      }),
    ).toMatchObject({
      slaStatus: "critical",
      slaSort: "remaining_asc",
    });

    expect(
      problemDetailsSchema.safeParse({
        type: "/problems/ticket-version-conflict",
        title: "Ticket version conflict",
        status: 412,
        detail: "O Ticket foi alterado por outra operação.",
        instance: "/tickets/8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2",
        code: "ticket.version_conflict",
        requestId: "req_01JEXAMPLE",
        errors: [],
      }).success,
    ).toBe(true);
  });
});
