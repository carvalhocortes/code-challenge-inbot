import { z } from "zod";

export const ticketPrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const ticketStatusSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "closed",
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketProcessingStatusSchema = z.enum([
  "pending",
  "processing",
  "processed",
  "failed",
]);
export type TicketProcessingStatus = z.infer<
  typeof ticketProcessingStatusSchema
>;

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const createTicketRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2_000),
  requesterEmail: z.string().email(),
  priority: ticketPrioritySchema,
});
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

export const updateTicketStatusRequestSchema = z
  .object({
    status: ticketStatusSchema,
  })
  .strict();
export type UpdateTicketStatusRequest = z.infer<
  typeof updateTicketStatusRequestSchema
>;

export const updateTicketPriorityRequestSchema = z.object({
  priority: ticketPrioritySchema,
});
export type UpdateTicketPriorityRequest = z.infer<
  typeof updateTicketPriorityRequestSchema
>;

export const ticketResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  requesterEmail: z.string().email(),
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  processingStatus: ticketProcessingStatusSchema,
  slaDueAt: isoDateTimeSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TicketResponse = z.infer<typeof ticketResponseSchema>;

export const ticketHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["created", "status_changed", "priority_changed"]),
  previousValue: z.string().nullable(),
  nextValue: z.string().nullable(),
  source: z.enum(["operator", "system"]),
  createdAt: isoDateTimeSchema,
});
export type TicketHistoryEntry = z.infer<typeof ticketHistoryEntrySchema>;

export const ticketDetailResponseSchema = ticketResponseSchema.extend({
  history: z.array(ticketHistoryEntrySchema),
});
export type TicketDetailResponse = z.infer<typeof ticketDetailResponseSchema>;

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().min(1).optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const listTicketsResponseSchema = z.object({
  items: z.array(ticketResponseSchema),
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListTicketsResponse = z.infer<typeof listTicketsResponseSchema>;

export const problemFieldErrorSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
});
export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;

export const problemDetailsSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1),
  instance: z.string().min(1).optional(),
  code: z.string().min(1),
  requestId: z.string().min(1),
  errors: z.array(problemFieldErrorSchema).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const ticketSlaJobSchema = z
  .object({
    ticketId: z.string().uuid(),
    processingVersion: z.number().int().positive(),
  })
  .strict();
export type TicketSlaJob = z.infer<typeof ticketSlaJobSchema>;
