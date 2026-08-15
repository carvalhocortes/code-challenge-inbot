import type { TicketDetailResponse } from "@inbot/shared";
import { useQuery } from "@tanstack/react-query";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";

export function ticketDetailQueryKey(ticketId: string) {
  return ["ticket", ticketId] as const;
}

export function useTicketDetail(ticketId: string) {
  return useQuery({
    enabled: Boolean(ticketId),
    queryFn: () => ticketApi.get(ticketId),
    queryKey: ticketDetailQueryKey(ticketId),
    refetchInterval: (currentQuery) =>
      hasActiveTicketProcessing(currentQuery.state.data) ? 3_000 : false,
  });
}

export function hasActiveTicketProcessing(
  ticket: TicketDetailResponse | undefined,
): boolean {
  return (
    ticket?.processingStatus === "pending" ||
    ticket?.processingStatus === "processing"
  );
}
