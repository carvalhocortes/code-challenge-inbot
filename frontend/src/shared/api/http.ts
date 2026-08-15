import { problemDetailsSchema, type ProblemDetails } from "@inbot/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class ApiProblemError extends Error {
  readonly problem: ProblemDetails | null;

  constructor(status: number, problem: ProblemDetails | null) {
    super(problem?.detail ?? "Não foi possível concluir esta operação.");
    this.name = "ApiProblemError";
    this.problem = problem;
    this.status = status;
  }

  readonly status: number;
}

export async function requestJson<T>(
  path: string,
  schema: { parse(input: unknown): T },
  init?: RequestInit,
): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(new URL(path, apiBaseUrl), {
    ...init,
    headers: {
      Accept: "application/json, application/problem+json",
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiProblemError(
      response.status,
      problemDetailsSchema.safeParse(body).data ?? null,
    );
  }

  return { data: schema.parse(body), headers: response.headers };
}
