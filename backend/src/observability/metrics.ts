import { metrics } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";

const meter = metrics.getMeter("inbot.backend");

const httpRequests = meter.createCounter("inbot.http.server.requests", {
  unit: "{request}",
  description: "HTTP requests completed by the API",
});
const httpDuration = meter.createHistogram("inbot.http.server.duration", {
  unit: "ms",
  description: "HTTP request duration",
});
const slaJobs = meter.createCounter("inbot.sla.jobs", {
  unit: "{job}",
  description: "SLA jobs completed or failed",
});
const slaDuration = meter.createHistogram("inbot.sla.job.duration", {
  unit: "ms",
  description: "SLA job processing duration",
});
const outboxMessages = meter.createCounter("inbot.outbox.messages", {
  unit: "{message}",
  description: "Outbox messages published or failed",
});

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
): void {
  const attributes = {
    [ATTR_HTTP_REQUEST_METHOD]: method,
    [ATTR_HTTP_ROUTE]: route,
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
  };
  httpRequests.add(1, attributes);
  httpDuration.record(durationMs, attributes);
}

export function recordSlaJob(
  outcome: "completed" | "failed" | "ignored" | "retryable_failure",
  durationMs: number,
): void {
  const attributes = { outcome };
  slaJobs.add(1, attributes);
  slaDuration.record(durationMs, attributes);
}

export function recordOutboxMessage(
  outcome: "published" | "failed" | "release_failed",
): void {
  outboxMessages.add(1, { outcome });
}
