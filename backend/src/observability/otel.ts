import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, "");
const telemetryEnabled =
  process.env.OTEL_SDK_DISABLED !== "true" && endpoint !== undefined;

const sdk = telemetryEnabled
  ? new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 10_000,
      }),
      instrumentations: [
        new FastifyOtelInstrumentation({
          registerOnInitialization: true,
          ignorePaths: (route) => route.url.startsWith("/health/"),
          instrumentHooks: false,
        }),
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-dns": { enabled: false },
        }),
      ],
    })
  : undefined;

if (sdk !== undefined) {
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk !== undefined) {
    await sdk.shutdown();
  }
}
