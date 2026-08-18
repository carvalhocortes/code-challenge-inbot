import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  ListTicketsQuery,
  TicketDetail,
  TicketHistoryEntry,
  TicketList,
  TicketQueryRepository,
} from "../../application/tickets/contracts.js";
import { TicketNotFoundError } from "../../application/tickets/errors.js";
import {
  defaultSlaThresholds,
  type SlaThresholds,
} from "../../domain/sla-status.js";
import type { Clock } from "../../domain/ticket.js";
import type { Database } from "./database.js";
import { tickets, ticketHistories } from "./schema.js";
import { toDomainTicket } from "./ticket-mapper.js";

/** PostgreSQL/Drizzle implementation of Ticket query ports. */
export class PostgresTicketQueryRepository implements TicketQueryRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly slaThresholds: SlaThresholds = defaultSlaThresholds,
  ) {}

  async listTickets(query: ListTicketsQuery): Promise<TicketList> {
    const conditions: SQL[] = [];

    if (query.status !== undefined) {
      conditions.push(eq(tickets.status, query.status));
    }

    if (query.priority !== undefined) {
      conditions.push(eq(tickets.priority, query.priority));
    }

    if (query.q !== undefined) {
      const pattern = `%${query.q}%`;
      const textFilter = or(
        ilike(tickets.title, pattern),
        ilike(tickets.description, pattern),
      );

      if (textFilter !== undefined) {
        conditions.push(textFilter);
      }
    }

    const now = this.clock.now();
    const remainingMs = sql<number>`extract(epoch from (${tickets.slaDueAt} - ${now})) * 1000`;
    const totalMs = sql<number>`extract(epoch from (${tickets.slaDueAt} - ${tickets.createdAt})) * 1000`;
    const remainingPercent = sql<number>`(${remainingMs} / nullif(${totalMs}, 0)) * 100`;

    if (query.slaStatus !== undefined) {
      const statusCondition = {
        overdue: sql`${tickets.slaDueAt} is not null and (${tickets.slaDueAt} <= ${now} or ${totalMs} <= 0)`,
        critical: sql`${tickets.slaDueAt} is not null and ${tickets.slaDueAt} > ${now} and ${totalMs} > 0 and ${remainingPercent} < ${this.slaThresholds.criticalPercent}`,
        alert: sql`${tickets.slaDueAt} is not null and ${tickets.slaDueAt} > ${now} and ${totalMs} > 0 and ${remainingPercent} >= ${this.slaThresholds.criticalPercent} and ${remainingPercent} <= ${this.slaThresholds.alertPercent}`,
        on_track: sql`${tickets.slaDueAt} is not null and ${tickets.slaDueAt} > ${now} and ${totalMs} > 0 and ${remainingPercent} > ${this.slaThresholds.alertPercent}`,
      }[query.slaStatus];
      conditions.push(statusCondition);
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);
    const orderBy =
      query.slaSort === undefined
        ? [desc(tickets.createdAt), desc(tickets.id)]
        : [
            sql`${remainingMs} ${query.slaSort === "remaining_asc" ? sql`asc` : sql`desc`} nulls last`,
            desc(tickets.createdAt),
            desc(tickets.id),
          ];
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(tickets)
        .where(where)
        .orderBy(...orderBy)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(tickets).where(where),
    ]);
    const total = totals[0]?.total ?? 0;

    return {
      items: rows.map(toDomainTicket),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    };
  }

  async getTicketDetail(ticketId: string): Promise<TicketDetail> {
    const ticketRecords = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);
    const ticket = ticketRecords[0];

    if (ticket === undefined) {
      throw new TicketNotFoundError();
    }

    const history: TicketHistoryEntry[] = await this.db
      .select({
        id: ticketHistories.id,
        type: ticketHistories.type,
        previousValue: ticketHistories.previousValue,
        nextValue: ticketHistories.nextValue,
        source: ticketHistories.source,
        createdAt: ticketHistories.createdAt,
      })
      .from(ticketHistories)
      .where(eq(ticketHistories.ticketId, ticketId))
      .orderBy(asc(ticketHistories.createdAt), asc(ticketHistories.id));

    return { ticket: toDomainTicket(ticket), history };
  }
}
