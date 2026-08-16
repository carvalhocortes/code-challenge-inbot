import type { TicketSlaStatus } from "@inbot/shared";

export interface SlaThresholds {
  criticalPercent: number;
  alertPercent: number;
}

export interface SlaEvaluation {
  status: TicketSlaStatus | null;
  remainingMs: number | null;
}

export const defaultSlaThresholds: SlaThresholds = {
  criticalPercent: 10,
  alertPercent: 40,
};

export function evaluateSla(
  createdAt: Date,
  dueAt: Date | null,
  now: Date,
  thresholds: SlaThresholds = defaultSlaThresholds,
): SlaEvaluation {
  if (dueAt === null) {
    return { status: null, remainingMs: null };
  }

  const remainingMs = dueAt.getTime() - now.getTime();
  const totalMs = dueAt.getTime() - createdAt.getTime();

  if (remainingMs <= 0 || totalMs <= 0) {
    return { status: "overdue", remainingMs };
  }

  const remainingPercent = (remainingMs / totalMs) * 100;

  if (remainingPercent < thresholds.criticalPercent) {
    return { status: "critical", remainingMs };
  }

  if (remainingPercent <= thresholds.alertPercent) {
    return { status: "alert", remainingMs };
  }

  return { status: "on_track", remainingMs };
}
