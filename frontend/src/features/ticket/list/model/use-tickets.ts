import type { ListTicketsQuery, ListTicketsResponse } from "@inbot/shared";
import { useQuery } from "@tanstack/react-query";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";

export function useTickets(query: ListTicketsQuery) {
  return useQuery({
    queryFn: () => ticketApi.list(query),
    queryKey: ["tickets", query],
    refetchInterval: (currentQuery) =>
      hasActiveProcessing(currentQuery.state.data) ? 3_000 : false,
  });
}

export function hasActiveProcessing(
  tickets: ListTicketsResponse | undefined,
): boolean {
  return Boolean(
    tickets?.items.some(
      (ticket) =>
        ticket.processingStatus === "pending" ||
        ticket.processingStatus === "processing",
    ),
  );
}
