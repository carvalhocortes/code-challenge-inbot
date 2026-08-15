import type { CreateTicketRequest, TicketResponse } from "@inbot/shared";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";

export function useCreateTicket() {
  const idempotencyKey = useRef<string | undefined>(undefined);

  return useMutation<TicketResponse, Error, CreateTicketRequest>({
    mutationFn: async (ticket) => {
      idempotencyKey.current ??= createIdempotencyKey();
      return ticketApi.create(ticket, idempotencyKey.current);
    },
  });
}

function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `ticket-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
