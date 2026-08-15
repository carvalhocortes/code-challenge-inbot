import type {
  TicketPriority,
  TicketResponse,
  TicketStatus,
} from "@inbot/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";
import { ticketDetailQueryKey } from "../../detail/model/use-ticket-detail";

type TicketAction =
  | { kind: "reprocess"; version: number }
  | { kind: "priority"; priority: TicketPriority; version: number }
  | { kind: "status"; status: TicketStatus; version: number };

export function useTicketActions(ticketId: string) {
  const queryClient = useQueryClient();

  return useMutation<TicketResponse, Error, TicketAction>({
    mutationFn: (action) => {
      if (action.kind === "status") {
        return ticketApi.updateStatus(ticketId, action.status, action.version);
      }

      if (action.kind === "priority") {
        return ticketApi.updatePriority(
          ticketId,
          action.priority,
          action.version,
        );
      }

      return ticketApi.reprocess(ticketId, action.version);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ticketDetailQueryKey(ticketId),
        }),
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
      ]);
    },
  });
}
