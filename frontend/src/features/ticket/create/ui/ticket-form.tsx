import { zodResolver } from "@hookform/resolvers/zod";
import {
  createTicketRequestSchema,
  type CreateTicketRequest,
  type TicketPriority,
} from "@inbot/shared";
import { type ReactNode, useId } from "react";
import { useForm } from "react-hook-form";

export interface TicketFormProps {
  onCreate(ticket: CreateTicketRequest): Promise<void> | void;
  problemReference?: string | null;
  submitting?: boolean;
  problem?: string | null;
}

const priorities: Array<{
  value: TicketPriority;
  label: string;
  target: string;
}> = [
  { value: "critical", label: "Crítica", target: "4 horas úteis" },
  { value: "high", label: "Alta", target: "8 horas úteis" },
  { value: "medium", label: "Média", target: "16 horas úteis" },
  { value: "low", label: "Baixa", target: "24 horas úteis" },
];

export function TicketForm({
  onCreate,
  problemReference,
  submitting = false,
  problem,
}: TicketFormProps) {
  const formId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTicketRequest>({
    resolver: zodResolver(createTicketRequestSchema),
    defaultValues: { priority: "medium" },
  });

  return (
    <form className="ticket-form" noValidate onSubmit={handleSubmit(onCreate)}>
      {problem ? (
        <div className="problem-state" role="alert">
          <p>{problem}</p>
          {problemReference ? (
            <small className="problem-reference">
              Referência: {problemReference}
            </small>
          ) : null}
        </div>
      ) : null}

      <Field
        error={errors.title ? titleErrorMessage(errors.title.type) : undefined}
        hint="Entre 3 e 120 caracteres."
        id={`${formId}-title`}
        label="Título"
      >
        <input
          {...register("title")}
          aria-describedby={
            errors.title ? `${formId}-title-error` : `${formId}-title-hint`
          }
          aria-invalid={Boolean(errors.title)}
          id={`${formId}-title`}
          type="text"
        />
      </Field>

      <Field
        error={
          errors.description
            ? descriptionErrorMessage(errors.description.type)
            : undefined
        }
        hint="Explique o contexto em pelo menos 10 caracteres."
        id={`${formId}-description`}
        label="Descrição"
      >
        <textarea
          {...register("description")}
          aria-describedby={
            errors.description
              ? `${formId}-description-error`
              : `${formId}-description-hint`
          }
          aria-invalid={Boolean(errors.description)}
          id={`${formId}-description`}
          rows={6}
        />
      </Field>

      <Field
        error={errors.requesterEmail ? "Informe um e-mail válido." : undefined}
        hint="Usaremos este endereço para identificar o solicitante."
        id={`${formId}-requester-email`}
        label="E-mail do solicitante"
      >
        <input
          {...register("requesterEmail")}
          aria-describedby={
            errors.requesterEmail
              ? `${formId}-requester-email-error`
              : `${formId}-requester-email-hint`
          }
          aria-invalid={Boolean(errors.requesterEmail)}
          id={`${formId}-requester-email`}
          type="email"
        />
      </Field>

      <Field id={`${formId}-priority`} label="Prioridade">
        <select {...register("priority")} id={`${formId}-priority`}>
          {priorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label} — prazo-alvo: {priority.target}
            </option>
          ))}
        </select>
      </Field>

      <button
        className="button button-primary"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Criando ticket…" : "Criar ticket"}
      </button>
    </form>
  );
}

function Field({
  children,
  error,
  hint,
  id,
  label,
}: {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function titleErrorMessage(type: string): string {
  return type === "too_big"
    ? "Use no máximo 120 caracteres no título."
    : "Informe um título com ao menos 3 caracteres.";
}

function descriptionErrorMessage(type: string): string {
  return type === "too_big"
    ? "Use no máximo 2.000 caracteres na descrição."
    : "Informe uma descrição com ao menos 10 caracteres.";
}
