import { validationReason } from "./problem-details.js";

export function validationErrors(
  issues: ReadonlyArray<{
    path: readonly (string | number)[];
    code: string;
  }>,
  defaultField = "body",
): Array<{ field: string; reason: string }> {
  return issues.map((issue) => ({
    field: issue.path.join(".") || defaultField,
    reason: validationReason(issue.code),
  }));
}

export function parseTicketId(value: string): string | undefined {
  return isUuid(value) ? value : undefined;
}

export function parseIfMatch(
  header: string | string[] | undefined,
): number | undefined {
  if (typeof header !== "string") {
    return undefined;
  }
  const version = /^"([1-9]\d*)"$/.exec(header)?.[1];
  return version === undefined ? undefined : Number.parseInt(version, 10);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
