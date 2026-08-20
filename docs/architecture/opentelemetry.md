# OpenTelemetry no backend

## Objetivo

Adicionar traces e métricas ao backend, correlacionando a API Fastify, o
PostgreSQL/Redis, o Outbox, o Worker BullMQ e a integração com a BrasilAPI.
Os logs JSON existentes continuam sendo a saída operacional principal, mas
passam a incluir `traceId` e `spanId` quando houver um span ativo.

## Escopo desta implementação

- Inicializar o OpenTelemetry antes do carregamento da API ou do Worker.
- Usar instrumentação automática para HTTP, Fastify, PostgreSQL, ioredis,
  `fetch`/Undici e Pino quando disponível.
- Criar spans manuais para publicação do Outbox e processamento do SLA.
- Exportar traces e métricas por OTLP para um Collector configurável.
- Propagar `traceparent` pelo Outbox/BullMQ sem adicionar dados pessoais ao
  payload de negócio.
- Manter `x-request-id`, logs redigidos, readiness e contratos HTTP atuais.

Ficam fora deste slice a instrumentação do frontend/browser, OpenTelemetry
Logs, dashboards de fornecedor e alertas de produção.

## Decisões

### 1. O contexto assíncrono será um envelope interno

O payload de negócio continuará contendo somente `ticketId` e
`processingVersion`. O registro Outbox e a mensagem BullMQ passarão a carregar
um envelope com:

```ts
{
  payload: { ticketId, processingVersion },
  telemetry?: { traceparent?: string, tracestate?: string }
}
```

Assim, o contexto W3C não contamina o domínio do Ticket e continua disponível
depois que a transação HTTP terminar.

### 2. O Collector será opcional para o processo

Com `OTEL_SDK_DISABLED=true`, testes e execuções sem Collector continuam
funcionando. Em Compose, a exportação será habilitada explicitamente e usará
`OTEL_EXPORTER_OTLP_ENDPOINT`.

### 3. A instrumentação não altera o fluxo de negócio

Falhas de exportação, configuração ou encerramento do SDK não podem impedir a
criação de tickets, a publicação do Outbox ou o processamento do SLA.

## Riscos e controles

| Risco                                    | Controle                                                   |
| ---------------------------------------- | ---------------------------------------------------------- |
| SDK carregado tarde demais               | Bootstrap separado carregado antes da API/Worker           |
| Perda de correlação no Worker            | `traceparent` persistido no envelope do Outbox             |
| Vazamento de dados pessoais              | Atributos limitados a IDs técnicos, tipo, status e duração |
| Dependência operacional do Collector     | SDK desabilitável e exporters assíncronos                  |
| Excesso de spans em health checks        | Ignorar ou reduzir telemetria de `/health/*`               |
| Mudança acidental do contrato de negócio | Schema separado para payload e envelope                    |

## Critérios de aceitação

- Uma criação de ticket produz um trace que pode relacionar API, banco,
  Outbox, publicação e Worker.
- Um retry do SLA aparece como tentativa distinta, sem duplicar a mutação de
  negócio.
- Logs da API e do Worker incluem `traceId` e `spanId` quando aplicável.
- Métricas cobrem requisições HTTP, jobs SLA, retries, falhas e publicação do
  Outbox.
- O backend inicia e os testes passam com o SDK desabilitado ou sem Collector.
- Nenhum e-mail, descrição, token ou segredo é incluído na telemetria.
