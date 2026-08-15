import {
  listTicketsResponseSchema,
  ticketDetailResponseSchema,
  ticketResponseSchema,
  type CreateTicketRequest,
  type ListTicketsQuery,
  type ListTicketsResponse,
  type TicketDetailResponse,
  type TicketPriority,
  type TicketResponse,
  type TicketStatus,
} from "@inbot/shared";

import { requestJson } from "../../../shared/api/http";

export class TicketApi {
  async create(
    ticket: CreateTicketRequest,
    idempotencyKey: string,
  ): Promise<TicketResponse> {
    const result = await requestJson("/tickets", ticketResponseSchema, {
      body: JSON.stringify(ticket),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    });

    return result.data;
  }

  async get(ticketId: string): Promise<TicketDetailResponse> {
    const result = await requestJson(
      `/tickets/${encodeURIComponent(ticketId)}`,
      ticketDetailResponseSchema,
    );

    return result.data;
  }

  async list(query: ListTicketsQuery): Promise<ListTicketsResponse> {
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    if (query.priority) params.set("priority", query.priority);

    const result = await requestJson(
      `/tickets?${params.toString()}`,
      listTicketsResponseSchema,
    );

    return result.data;
  }

  async reprocess(ticketId: string, version: number): Promise<TicketResponse> {
    const result = await requestJson(
      `/tickets/${encodeURIComponent(ticketId)}/reprocess`,
      ticketResponseSchema,
      {
        headers: { "If-Match": etagFor(version) },
        method: "POST",
      },
    );

    return result.data;
  }

  async updatePriority(
    ticketId: string,
    priority: TicketPriority,
    version: number,
  ): Promise<TicketResponse> {
    const result = await requestJson(
      `/tickets/${encodeURIComponent(ticketId)}/priority`,
      ticketResponseSchema,
      {
        body: JSON.stringify({ priority }),
        headers: {
          "Content-Type": "application/json",
          "If-Match": etagFor(version),
        },
        method: "PATCH",
      },
    );

    return result.data;
  }

  async updateStatus(
    ticketId: string,
    status: TicketStatus,
    version: number,
  ): Promise<TicketResponse> {
    const result = await requestJson(
      `/tickets/${encodeURIComponent(ticketId)}/status`,
      ticketResponseSchema,
      {
        body: JSON.stringify({ status }),
        headers: {
          "Content-Type": "application/json",
          "If-Match": etagFor(version),
        },
        method: "PATCH",
      },
    );

    return result.data;
  }
}

export const ticketApi = new TicketApi();

function etagFor(version: number): string {
  return `"${version}"`;
}
