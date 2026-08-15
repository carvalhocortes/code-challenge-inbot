import type { CreateTicketRequest } from "@inbot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi, type ApiDependencies } from "./app.js";
import { TicketDomainError } from "../domain/ticket.js";
import {
  TicketNotFoundError,
  TicketVersionConflictError,
} from "../application/tickets/errors.js";

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

  it("preserves the original response status when creation is replayed", async () => {
    const dependencies: ApiDependencies = {
      tickets: {
        createTicketWithProcessingIntent: vi.fn(async () => ({
          kind: "replayed" as const,
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
        })),
      },
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
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(response.headers["idempotency-replayed"]).toBe("true");
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

  it("returns a problem when the idempotency key is absent", async () => {
    const dependencies: ApiDependencies = {
      tickets: { createTicketWithProcessingIntent: vi.fn() },
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/tickets",
      payload: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "idempotency.key_required",
      status: 400,
    });
  });

  it("returns a problem for malformed JSON", async () => {
    const dependencies: ApiDependencies = {
      tickets: { createTicketWithProcessingIntent: vi.fn() },
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
        "content-type": "application/json",
        "idempotency-key": "create-003",
      },
      payload: '{"title":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "request.invalid_json",
      status: 400,
    });
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

describe("PATCH /tickets/:id/status", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("requires an ETag and updates the status with the expected version", async () => {
    const updateTicketStatus = vi.fn(async () => ({
      kind: "changed" as const,
      previousStatus: "open" as const,
      ticket: {
        id: ticketId,
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high" as const,
        status: "in_progress" as const,
        processingStatus: "pending" as const,
        slaDueAt: null,
        version: 2,
        createdAt,
        updatedAt: createdAt,
      },
    }));
    const dependencies: ApiDependencies = {
      tickets: { updateTicketStatus } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const missingPrecondition = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/status`,
      payload: { status: "in_progress" },
    });

    expect(missingPrecondition.statusCode).toBe(428);
    expect(missingPrecondition.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(missingPrecondition.json()).toMatchObject({
      code: "ticket.precondition_required",
      requestId: expect.any(String),
    });
    expect(updateTicketStatus).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/status`,
      headers: { "if-match": '"1"' },
      payload: { status: "in_progress" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(response.json()).toMatchObject({
      id: ticketId,
      status: "in_progress",
      version: 2,
    });
    expect(updateTicketStatus).toHaveBeenCalledWith({
      ticketId,
      expectedVersion: 1,
      status: "in_progress",
    });
  });

  it("returns a version conflict when If-Match is stale", async () => {
    const dependencies: ApiDependencies = {
      tickets: {
        updateTicketStatus: async () => {
          throw new TicketVersionConflictError();
        },
      } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/status`,
      headers: { "if-match": '"1"' },
      payload: { status: "in_progress" },
    });

    expect(response.statusCode).toBe(412);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "ticket.version_conflict",
      requestId: expect.any(String),
    });
  });
});

describe("PATCH /tickets/:id/priority", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("changes priority with the current ETag and schedules processing again", async () => {
    const changeTicketPriority = vi.fn(async () => ({
      kind: "changed" as const,
      previousPriority: "high" as const,
      ticket: {
        id: ticketId,
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "critical" as const,
        status: "open" as const,
        processingStatus: "pending" as const,
        slaDueAt: null,
        version: 2,
        createdAt,
        updatedAt: createdAt,
      },
    }));
    const dependencies: ApiDependencies = {
      tickets: { changeTicketPriority } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/priority`,
      headers: { "if-match": '"1"' },
      payload: { priority: "critical" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"2"');
    expect(response.json()).toMatchObject({
      id: ticketId,
      priority: "critical",
      processingStatus: "pending",
      version: 2,
    });
    expect(changeTicketPriority).toHaveBeenCalledWith({
      ticketId,
      expectedVersion: 1,
      priority: "critical",
    });
  });
});

describe("POST /tickets/:id/reprocess", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("reprocesses a failed Ticket with a new observable version", async () => {
    const reprocessTicket = vi.fn(async () => ({
      id: ticketId,
      title: "Acesso ao sistema indisponível",
      description: "O operador não consegue acessar o sistema desde as 09:00.",
      requesterEmail: "operador@example.com",
      priority: "high" as const,
      status: "open" as const,
      processingStatus: "pending" as const,
      slaDueAt: null,
      version: 3,
      createdAt,
      updatedAt: createdAt,
    }));
    const dependencies: ApiDependencies = {
      tickets: { reprocessTicket } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/tickets/${ticketId}/reprocess`,
      headers: { "if-match": '"2"' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers.etag).toBe('"3"');
    expect(response.json()).toMatchObject({
      id: ticketId,
      processingStatus: "pending",
      version: 3,
    });
    expect(reprocessTicket).toHaveBeenCalledWith({
      ticketId,
      expectedVersion: 2,
    });
  });
});

describe("HTTP boundary safeguards", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("applies the CORS allowlist and returns a problem after the configured rate limit", async () => {
    const dependencies: ApiDependencies = {
      tickets: {} as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies, {
      bodyLimit: 1_024,
      corsOrigin: "http://localhost:5173",
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    });
    apps.push(app);

    const first = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { origin: "http://localhost:5173" },
    });
    const second = await app.inject({ method: "GET", url: "/health/live" });

    expect(first.statusCode).toBe(200);
    expect(first.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(first.headers["x-content-type-options"]).toBe("nosniff");

    const patchPreflight = await app.inject({
      method: "OPTIONS",
      url: `/tickets/${ticketId}/status`,
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type,if-match",
      },
    });

    expect(patchPreflight.statusCode).toBe(204);
    expect(patchPreflight.headers["access-control-allow-methods"]).toContain(
      "PATCH",
    );
    expect(patchPreflight.headers["access-control-allow-headers"]).toContain(
      "if-match",
    );

    expect(second.statusCode).toBe(429);
    expect(second.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(second.json()).toMatchObject({
      code: "rate_limit.exceeded",
      status: 429,
    });
  });

  it("reports readiness failures as a dependency problem", async () => {
    const dependencies: ApiDependencies = {
      tickets: {} as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => {
        throw new Error("redis password should not be exposed");
      },
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toEqual({
      type: "/problems/dependency-unavailable",
      title: "Dependency unavailable",
      status: 503,
      detail: "Uma dependência necessária não está disponível.",
      instance: "/health/ready",
      code: "dependency.unavailable",
      requestId: expect.any(String),
    });
  });

  it("returns a safe problem when the body exceeds the configured limit", async () => {
    const dependencies: ApiDependencies = {
      tickets: { createTicketWithProcessingIntent: vi.fn() },
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies, {
      bodyLimit: 100,
      corsOrigin: "http://localhost:5173",
      rateLimitMax: 100,
      rateLimitWindowMs: 60_000,
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/tickets",
      headers: { "idempotency-key": "create-004" },
      payload: {
        title: "Acesso ao sistema indisponível",
        description: "x".repeat(200),
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    expect(response.statusCode).toBe(413);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "request.body_too_large",
      status: 413,
    });
  });

  it("rejects an invalid Ticket identifier before reaching persistence", async () => {
    const getTicketDetail = vi.fn();
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
      url: "/tickets/not-a-uuid",
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "request.validation_failed",
      errors: [{ field: "id", reason: "invalid_format" }],
    });
    expect(getTicketDetail).not.toHaveBeenCalled();
  });
});

describe("HTTP problem mappings", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("returns ticket.not_found when the requested Ticket does not exist", async () => {
    const dependencies: ApiDependencies = {
      tickets: {
        getTicketDetail: async () => {
          throw new TicketNotFoundError();
        },
      } as ApiDependencies["tickets"],
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

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "ticket.not_found",
      status: 404,
    });
  });

  it("returns a stable conflict problem for an invalid status transition", async () => {
    const dependencies: ApiDependencies = {
      tickets: {
        updateTicketStatus: async () => {
          throw new TicketDomainError("ticket.status_transition_invalid");
        },
      } as ApiDependencies["tickets"],
      createTicketId: () => ticketId,
      checkReadiness: async () => undefined,
      close: async () => undefined,
    };
    const app = buildApi(dependencies);
    apps.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/tickets/${ticketId}/status`,
      headers: { "if-match": '"1"' },
      payload: { status: "resolved" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      code: "ticket.status_transition_invalid",
      status: 409,
    });
  });
});
