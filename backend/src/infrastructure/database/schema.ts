import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { TicketSlaJobMessage } from "@inbot/shared";

export const ticketPriority = pgEnum("ticket_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);
export const ticketProcessingStatus = pgEnum("ticket_processing_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);
export const ticketHistoryType = pgEnum("ticket_history_type", [
  "created",
  "status_changed",
  "priority_changed",
]);
export const ticketHistorySource = pgEnum("ticket_history_source", [
  "operator",
  "system",
]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "published",
]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),
    description: varchar("description", { length: 2_000 }).notNull(),
    requesterEmail: varchar("requester_email", { length: 320 }).notNull(),
    priority: ticketPriority("priority").notNull(),
    status: ticketStatus("status").notNull(),
    processingStatus: ticketProcessingStatus("processing_status").notNull(),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true, mode: "date" }),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("tickets_status_priority_idx").on(table.status, table.priority),
    index("tickets_created_at_id_idx").on(table.createdAt, table.id),
  ],
);

export const ticketHistories = pgTable(
  "ticket_history",
  {
    id: uuid("id").primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    type: ticketHistoryType("type").notNull(),
    previousValue: text("previous_value"),
    nextValue: text("next_value"),
    source: ticketHistorySource("source").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("ticket_history_ticket_created_at_idx").on(
      table.ticketId,
      table.createdAt,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    requestHash: text("request_hash").notNull(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_ticket_id_unique").on(table.ticketId),
  ],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    processingVersion: integer("processing_version").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<TicketSlaJobMessage>().notNull(),
    status: outboxStatus("status").notNull(),
    attempts: integer("attempts").notNull(),
    lockedUntil: timestamp("locked_until", {
      withTimezone: true,
      mode: "date",
    }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("outbox_messages_ticket_processing_version_unique").on(
      table.ticketId,
      table.processingVersion,
    ),
  ],
);
