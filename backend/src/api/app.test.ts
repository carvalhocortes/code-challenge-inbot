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

  it("returns a safe validation problem before creating a Ticket", async () => {
    const createTicketWithProcessingIntent = vi.fn();
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
      headers: {
        "idempotency-key": "create-002",
        "x-request-id": "request-002",
      },
      payload: {
        title: "A",
        description: "curta",
        requesterEmail: "not-an-email",
        priority: "urgent",
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toEqual({
      type: "/problems/request-validation-failed",
      title: "Request validation failed",
      status: 422,
      detail: "A requisição não atende ao contrato.",
      instance: "/tickets",
      code: "request.validation_failed",
      requestId: "request-002",
      errors: [
        { field: "title", reason: "invalid_length" },
        { field: "description", reason: "invalid_length" },
        { field: "requesterEmail", reason: "invalid_format" },
        { field: "priority", reason: "invalid_value" },
      ],
    });
    expect(createTicketWithProcessingIntent).not.toHaveBeenCalled();
  });
});

describe("GET /tickets", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("returns the paginated Ticket query with public timestamps", async () => {
    const listTickets = vi.fn(async () => ({
      items: [
        {
          id: ticketId,
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high" as const,
          status: "open" as const,
          processingStatus: "pending" as const,
          slaDueAt: null,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      meta: { page: 2, pageSize: 5, total: 6, totalPages: 2 },
    }));
    const dependencies: ApiDependencies = {
      tickets: { listTickets } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/tickets?page=2&pageSize=5&q=acesso&status=open&priority=high",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: ticketId,
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
          status: "open",
          processingStatus: "pending",
          slaDueAt: null,
          version: 1,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
      meta: { page: 2, pageSize: 5, total: 6, totalPages: 2 },
    });
    expect(listTickets).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      q: "acesso",
      status: "open",
      priority: "high",
    });
  });
});

describe("GET /tickets/:id", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("returns the Ticket detail and immutable history with its ETag", async () => {
    const getTicketDetail = vi.fn(async () => ({
      ticket: {
        id: ticketId,
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high" as const,
        status: "open" as const,
        processingStatus: "pending" as const,
        slaDueAt: null,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
      history: [
        {
          id: "81f4b41c-7e68-4ca4-912d-e7e2fa523c37",
          type: "created" as const,
          previousValue: null,
          nextValue: "open",
          source: "operator" as const,
          createdAt,
        },
      ],
    }));
    const dependencies: ApiDependencies = {
      tickets: { getTicketDetail } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/tickets/${ticketId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"1"');
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
      history: [
        {
          id: "81f4b41c-7e68-4ca4-912d-e7e2fa523c37",
          type: "created",
          previousValue: null,
          nextValue: "open",
          source: "operator",
          createdAt: "2026-08-14T12:00:00.000Z",
        },
      ],
    });
    expect(getTicketDetail).toHaveBeenCalledWith(ticketId);
  });
});
