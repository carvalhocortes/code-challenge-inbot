import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
} from "@opentelemetry/api";
import type { TicketSlaJob, TicketSlaJobMessage } from "@inbot/shared";

export interface TraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
}

export function currentTraceContext(): TraceContextCarrier | undefined {
  const carrier: TraceContextCarrier = {};
  propagation.inject(context.active(), carrier);

  return carrier.traceparent === undefined ? undefined : carrier;
}

export function contextFromTraceContext(
  carrier: TraceContextCarrier | undefined,
): Context {
  return carrier === undefined
    ? context.active()
    : propagation.extract(context.active(), carrier);
}

export function createTicketSlaJobMessage(
  payload: TicketSlaJob,
): TicketSlaJobMessage {
  const telemetry = currentTraceContext();

  return telemetry === undefined ? { payload } : { payload, telemetry };
}

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
  parentContext: Context = context.active(),
): Promise<T> {
  const tracer = trace.getTracer("inbot.backend");

  return tracer.startActiveSpan(
    name,
    { attributes },
    parentContext,
    async (span) => {
      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function activeTraceIdentifiers(): {
  traceId?: string;
  spanId?: string;
} {
  const spanContext = trace.getActiveSpan()?.spanContext();

  return spanContext === undefined
    ? {}
    : { traceId: spanContext.traceId, spanId: spanContext.spanId };
}
