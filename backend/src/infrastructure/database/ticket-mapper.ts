import type { Ticket } from "../../domain/ticket.js";
import { tickets } from "./schema.js";

export function toDomainTicket(record: typeof tickets.$inferSelect): Ticket {
  return { ...record, version: record.version };
}
