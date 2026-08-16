import type { ListTicketsQuery, ListTicketsResponse } from "@inbot/shared";
import { useQuery } from "@tanstack/react-query";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";

export function useTickets(query: ListTicketsQuery) {
  return useQuery({
    queryFn: () => ticketApi.list(query),
    queryKey: ["tickets", query],
    refetchInterval: (currentQuery) => {
      if (hasActiveProcessing(currentQuery.state.data)) return 3_000;

      return currentQuery.state.data?.items.some(
        (ticket) => ticket.slaDueAt !== null,
      )
        ? 60_000
        : false;
    },
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
