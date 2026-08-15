import type { TicketPriority, TicketStatus } from "@inbot/shared";

const priorityLabels: Record<TicketPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  low: "Baixa",
  medium: "Média",
};

const statusLabels: Record<TicketStatus, string> = {
  closed: "Fechado",
  in_progress: "Em andamento",
  open: "Aberto",
  resolved: "Resolvido",
};

export function ticketPriorityLabel(priority: TicketPriority): string {
  return priorityLabels[priority];
}

export function ticketStatusLabel(status: TicketStatus): string {
  return statusLabels[status];
}
