import { drizzle } from "drizzle-orm/node-postgres";

import { readRuntimeConfig } from "../config.js";
import { ticketHistories, tickets } from "../infrastructure/database/schema.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

const seededAt = new Date("2026-08-14T12:00:00.000Z");
const slaSeededAt = new Date();

function hoursFromSeed(hours: number): Date {
  return new Date(slaSeededAt.getTime() + hours * 60 * 60 * 1000);
}

const developmentTickets = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Acesso ao portal de demonstração",
    description: "Exemplo pendente para a central de tickets.",
    requesterEmail: "operador-pendente@example.test",
    priority: "critical" as const,
    status: "open" as const,
    processingStatus: "pending" as const,
    slaDueAt: null,
    version: 1,
    createdAt: new Date("2026-08-14T08:00:00.000Z"),
    updatedAt: seededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    title: "Consulta de relatório operacional",
    description: "Exemplo em processamento para a central de tickets.",
    requesterEmail: "operador-processando@example.test",
    priority: "high" as const,
    status: "in_progress" as const,
    processingStatus: "processing" as const,
    slaDueAt: null,
    version: 2,
    createdAt: new Date("2026-08-14T08:15:00.000Z"),
    updatedAt: seededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    title: "Atualização de cadastro operacional",
    description: "Exemplo já processado para a central de tickets.",
    requesterEmail: "operador-processado@example.test",
    priority: "medium" as const,
    status: "resolved" as const,
    processingStatus: "processed" as const,
    slaDueAt: new Date("2026-08-14T18:15:00.000Z"),
    version: 4,
    createdAt: new Date("2026-08-14T08:15:00.000Z"),
    updatedAt: seededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    title: "Exportação de indicadores",
    description: "Exemplo com falha de processamento para reprocessamento.",
    requesterEmail: "operador-falha@example.test",
    priority: "low" as const,
    status: "closed" as const,
    processingStatus: "failed" as const,
    slaDueAt: null,
    version: 4,
    createdAt: new Date("2026-08-14T08:30:00.000Z"),
    updatedAt: seededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    title: "SLA vencido — validação de contrato",
    description: "Exemplo vencido para demonstrar o filtro de SLA.",
    requesterEmail: "operador-sla-vencido@example.test",
    priority: "high" as const,
    status: "open" as const,
    processingStatus: "processed" as const,
    slaDueAt: hoursFromSeed(-1),
    version: 1,
    createdAt: hoursFromSeed(-6),
    updatedAt: slaSeededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    title: "SLA crítico — aprovação financeira",
    description: "Exemplo crítico com menos de dez por cento restante.",
    requesterEmail: "operador-sla-critico@example.test",
    priority: "high" as const,
    status: "in_progress" as const,
    processingStatus: "processed" as const,
    slaDueAt: hoursFromSeed(0.25),
    version: 1,
    createdAt: hoursFromSeed(-3),
    updatedAt: slaSeededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    title: "SLA em alerta — retorno ao solicitante",
    description: "Exemplo em alerta com quarenta por cento restante.",
    requesterEmail: "operador-sla-alerta@example.test",
    priority: "high" as const,
    status: "open" as const,
    processingStatus: "processed" as const,
    slaDueAt: hoursFromSeed(2),
    version: 1,
    createdAt: hoursFromSeed(-3),
    updatedAt: slaSeededAt,
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    title: "SLA on track — revisão de indicadores",
    description: "Exemplo no prazo com mais de quarenta por cento restante.",
    requesterEmail: "operador-sla-on-track@example.test",
    priority: "high" as const,
    status: "open" as const,
    processingStatus: "processed" as const,
    slaDueAt: hoursFromSeed(6),
    version: 1,
    createdAt: hoursFromSeed(-4),
    updatedAt: slaSeededAt,
  },
];

const developmentHistory = [
  history("20000000-0000-4000-8000-000000000001", 1, "created", null, "open"),
  history("20000000-0000-4000-8000-000000000002", 2, "created", null, "open"),
  history(
    "20000000-0000-4000-8000-000000000003",
    2,
    "status_changed",
    "open",
    "in_progress",
  ),
  history("20000000-0000-4000-8000-000000000004", 3, "created", null, "open"),
  history(
    "20000000-0000-4000-8000-000000000005",
    3,
    "status_changed",
    "open",
    "in_progress",
  ),
  history(
    "20000000-0000-4000-8000-000000000006",
    3,
    "priority_changed",
    "high",
    "medium",
  ),
  history(
    "20000000-0000-4000-8000-000000000007",
    3,
    "status_changed",
    "in_progress",
    "resolved",
  ),
  history("20000000-0000-4000-8000-000000000008", 4, "created", null, "open"),
  history(
    "20000000-0000-4000-8000-000000000009",
    4,
    "status_changed",
    "open",
    "in_progress",
  ),
  history(
    "20000000-0000-4000-8000-000000000010",
    4,
    "status_changed",
    "in_progress",
    "resolved",
  ),
  history(
    "20000000-0000-4000-8000-000000000011",
    4,
    "status_changed",
    "resolved",
    "closed",
  ),
  history("20000000-0000-4000-8000-000000000012", 5, "created", null, "open"),
  history("20000000-0000-4000-8000-000000000013", 6, "created", null, "open"),
  history("20000000-0000-4000-8000-000000000014", 7, "created", null, "open"),
  history("20000000-0000-4000-8000-000000000015", 8, "created", null, "open"),
];

function history(
  id: string,
  ticketNumber: number,
  type: "created" | "status_changed" | "priority_changed",
  previousValue: string | null,
  nextValue: string,
) {
  return {
    id,
    ticketId: `10000000-0000-4000-8000-00000000000${ticketNumber}`,
    type,
    previousValue,
    nextValue,
    source: "operator" as const,
    createdAt: seededAt,
  };
}

async function seed(): Promise<void> {
  const dependencies = createRuntimeDependencies(readRuntimeConfig());

  try {
    await checkRuntimeDependencies(dependencies);
    const db = drizzle(dependencies.postgres, {
      schema: { tickets, ticketHistories },
    });

    await db.transaction(async (transaction) => {
      await transaction
        .insert(tickets)
        .values(developmentTickets)
        .onConflictDoNothing();
      await transaction
        .insert(ticketHistories)
        .values(developmentHistory)
        .onConflictDoNothing();
    });

    process.stdout.write(
      "Development seed ready: 8 tickets and 15 history entries.\n",
    );
  } finally {
    await closeRuntimeDependencies(dependencies);
  }
}

await seed();
