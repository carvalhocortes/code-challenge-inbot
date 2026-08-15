export const ticketTimeZone = "America/Sao_Paulo";

export function formatTicketDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: ticketTimeZone,
  }).format(new Date(value));
}
