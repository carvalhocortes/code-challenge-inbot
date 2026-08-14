export type ProcessingFailure =
  | { kind: "timeout" }
  | { kind: "connection" }
  | { kind: "http"; status: number };

export type ProcessingFailureClassification = "transient" | "definitive";

export function classifyProcessingFailure(
  failure: ProcessingFailure,
): ProcessingFailureClassification {
  if (failure.kind === "timeout" || failure.kind === "connection") {
    return "transient";
  }

  if (
    failure.kind === "http" &&
    (failure.status === 429 || (failure.status >= 500 && failure.status <= 599))
  ) {
    return "transient";
  }

  return "definitive";
}
