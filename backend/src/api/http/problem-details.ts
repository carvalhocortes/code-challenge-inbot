import type { FastifyInstance, FastifyReply } from "fastify";

import {
  IdempotencyKeyReusedError,
  TicketNotFoundError,
  TicketReprocessNotAllowedError,
  TicketVersionConflictError,
} from "../../application/tickets/errors.js";
import { TicketDomainError } from "../../domain/ticket.js";
import { errorContext } from "../logging.js";

export function sendValidationProblem(
  instance: string,
  requestId: string,
  reply: FastifyReply,
  errors: Array<{ field: string; reason: string }>,
) {
  return reply.type("application/problem+json").code(422).send({
    type: "/problems/request-validation-failed",
    title: "Request validation failed",
    status: 422,
    detail: "A requisição não atende ao contrato.",
    instance,
    code: "request.validation_failed",
    requestId,
    errors,
  });
}

export function sendPreconditionRequired(
  instance: string,
  requestId: string,
  reply: FastifyReply,
) {
  return reply.type("application/problem+json").code(428).send({
    type: "/problems/ticket-precondition-required",
    title: "Ticket precondition required",
    status: 428,
    detail: "O header If-Match é obrigatório.",
    instance,
    code: "ticket.precondition_required",
    requestId,
  });
}

export function registerProblemDetails(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const problem = problemFor(error);

    if (problem !== undefined) {
      return reply
        .type("application/problem+json")
        .code(problem.status)
        .send({
          ...problem,
          instance: request.url,
          requestId: request.id,
        });
    }

    app.log.error(
      { ...errorContext(error), requestId: request.id },
      "Unhandled API error",
    );
    return reply.type("application/problem+json").code(500).send({
      type: "/problems/internal-unexpected",
      title: "Internal server error",
      status: 500,
      detail: "Ocorreu um erro inesperado.",
      instance: request.url,
      code: "internal.unexpected",
      requestId: request.id,
    });
  });
}

export function validationReason(issueCode: string): string {
  if (issueCode === "too_small" || issueCode === "too_big") {
    return "invalid_length";
  }

  return issueCode === "invalid_string" ? "invalid_format" : "invalid_value";
}

function problemFor(error: unknown):
  | {
      type: string;
      title: string;
      status: 400 | 404 | 409 | 412 | 413 | 429;
      detail: string;
      code: string;
    }
  | undefined {
  if (
    (error instanceof SyntaxError && hasStatusCode(error, 400)) ||
    hasErrorCode(error, "FST_ERR_CTP_INVALID_JSON_BODY")
  ) {
    return problem(
      "request-invalid-json",
      "Request invalid JSON",
      400,
      "O corpo da requisição contém JSON inválido.",
      "request.invalid_json",
    );
  }
  if (hasErrorCode(error, "FST_ERR_CTP_BODY_TOO_LARGE")) {
    return problem(
      "request-body-too-large",
      "Request body too large",
      413,
      "O corpo da requisição excede o limite permitido.",
      "request.body_too_large",
    );
  }
  if (hasStatusCode(error, 429)) {
    return problem(
      "rate-limit-exceeded",
      "Rate limit exceeded",
      429,
      "Muitas requisições; tente novamente mais tarde.",
      "rate_limit.exceeded",
    );
  }
  if (error instanceof TicketNotFoundError) {
    return problem(
      "ticket-not-found",
      "Ticket not found",
      404,
      "O Ticket não foi encontrado.",
      "ticket.not_found",
    );
  }
  if (error instanceof TicketVersionConflictError) {
    return problem(
      "ticket-version-conflict",
      "Ticket version conflict",
      412,
      "O Ticket foi alterado por outra operação.",
      "ticket.version_conflict",
    );
  }
  if (error instanceof IdempotencyKeyReusedError) {
    return problem(
      "idempotency-key-reused",
      "Idempotency key reused",
      409,
      "A chave de idempotência foi usada com outro payload.",
      "idempotency.key_reused",
    );
  }
  if (error instanceof TicketReprocessNotAllowedError) {
    return problem(
      "ticket-reprocess-not-allowed",
      "Ticket reprocess not allowed",
      409,
      "O Ticket não pode ser reprocessado no estado atual.",
      "ticket.reprocess_not_allowed",
    );
  }
  if (error instanceof TicketDomainError) {
    const isClosed = error.code === "ticket.closed";
    return problem(
      error.code.replace(".", "-"),
      isClosed ? "Ticket closed" : "Ticket status transition invalid",
      409,
      isClosed
        ? "A operação não é permitida em Ticket fechado."
        : "A transição de status não é permitida.",
      error.code,
    );
  }
}

function problem(
  type: string,
  title: string,
  status: 400 | 404 | 409 | 412 | 413 | 429,
  detail: string,
  code: string,
) {
  return { type: `/problems/${type}`, title, status, detail, code };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}
