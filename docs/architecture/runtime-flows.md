# Fluxos de execução — Gestão de Tickets InBot

**Público:** pessoas desenvolvedoras, avaliadores técnicos e avaliadores da solução.

Este documento explica o comportamento que dá significado à estrutura C4. O
catálogo completo de requests e responses está no código e seus testes; estes
diagramas cobrem os caminhos que alteram estado ou protegem consistência.

## Cobertura dos fluxos

| Fluxo               | Comportamento observado                                                |
| ------------------- | ---------------------------------------------------------------------- |
| Criação             | Validação, idempotência, transação e resposta imediata.                |
| Publicação e SLA    | Outbox, job determinístico, cache de feriados e persistência do prazo. |
| Falha e recuperação | Retry, falha definitiva e reprocessamento.                             |
| Condução do Ticket  | ETag/If-Match, conflito, status e prioridade.                          |
| Consulta da SPA     | Lista, detalhe e polling condicional do processamento.                 |

## Criação idempotente e intenção de processamento

```mermaid
sequenceDiagram
  participant UI as SPA / cliente HTTP
  participant API as API Fastify
  participant DB as PostgreSQL
  participant D as OutboxDispatcher
  participant Q as Redis / BullMQ

  UI->>API: POST /tickets + Idempotency-Key
  API->>API: valida corpo com Zod
  alt corpo ou chave inválidos
    API-->>UI: 400 ou 422 Problem Details
  else chave já usada com mesmo payload
    API->>DB: consulta chave e Ticket original
    DB-->>API: Ticket existente
    API-->>UI: 201 + ETag + Idempotency-Replayed: true
  else chave nova
    API->>DB: transação: Ticket + histórico + chave + Outbox
    DB-->>API: commit
    API-->>UI: 201 + Ticket pending + ETag
    D->>DB: claim Outbox pending com lease
    D->>Q: add calculate-sla(jobId determinístico)
    D->>DB: Outbox = published
  end
```

A resposta `201` não espera Redis, Worker ou BrasilAPI. Se Redis estiver
indisponível, a intenção permanece no PostgreSQL para uma tentativa posterior.

## Publicação repetida e processamento idempotente

```mermaid
flowchart TD
  A[Dispatcher reivindica mensagem pendente] --> B[Adiciona job deterministico]
  B --> C{Falha antes da confirmacao?}
  C -->|Sim| D[Lease expira e a mensagem volta a ser elegivel]
  D --> B
  C -->|Nao| E[Marca outbox como publicada]
  E --> F[Worker recebe o job]
  F --> G{Claim da versao atual do ticket?}
  G -->|Nao| H[Ignora job ja processado ou substituido]
  G -->|Sim| I[Obtem feriados]
  I --> J[Salva SLA e status processado]
  J --> K[Conclui job]
```

O `jobId` determinístico e o `claim` condicional não prometem entrega única;
eles tornam entrega repetida sem efeito de negócio duplicado.

## Retry, falha definitiva e reprocessamento

```mermaid
sequenceDiagram
  participant Q as Redis / BullMQ
  participant W as Worker
  participant H as Provedor de feriados
  participant DB as PostgreSQL
  participant UI as SPA
  participant API as API Fastify

  Q->>W: job de SLA
  W->>H: consulta feriados
  alt sucesso
    W->>DB: processingStatus = processed
  else timeout, conexão, 429 ou 5xx
    W-->>Q: erro recuperável
    Q-->>Q: retry com backoff exponencial
  else 4xx definitivo (exceto 429)
    W->>DB: processingStatus = failed
    W-->>Q: UnrecoverableError
  else última tentativa recuperável esgotada
    W->>DB: processingStatus = failed
  end

  UI->>API: POST /tickets/{id}/reprocess + If-Match
  API->>DB: nova versão pending + nova Outbox
  API-->>UI: 202 + novo ETag
```

O reprocessamento só é aceito para um Ticket `failed` ou `pending`; um Ticket
`processed` não recebe trabalho duplicado. O operador deve usar o ETag atual,
pois reprocessar também incrementa a versão.

## Concorrência otimista em status e prioridade

```mermaid
sequenceDiagram
  participant UI as SPA
  participant API as API Fastify
  participant DB as PostgreSQL

  UI->>API: GET /tickets/{id}
  API->>DB: Ticket + histórico
  DB-->>API: versão 3
  API-->>UI: 200 + ETag "3"
  UI->>API: PATCH status ou priority + If-Match "3"
  API->>DB: lê Ticket e compara versão
  alt Ticket já está na versão 4
    DB-->>API: TicketVersionConflict
    API-->>UI: 412 ticket.version_conflict
  else transição ou prioridade permitida
    alt mudança de status
      API->>DB: transação: atualiza Ticket + histórico
    else mudança de prioridade
      API->>DB: transação: Ticket pending + histórico + Outbox
    end
    DB-->>API: Ticket na versão 4
    API-->>UI: 200 + ETag "4"
  else regra de domínio rejeita o comando
    API-->>UI: 409 Problem Details
  end
```

Enviar o mesmo status ou a mesma prioridade é um _noop_: não gera histórico nem
incrementa a versão. A prioridade não pode ser alterada quando o Ticket está
fechado.

## Consulta e atualização sem recarga

```mermaid
sequenceDiagram
  participant UI as SPA
  participant API as API Fastify
  participant DB as PostgreSQL
  participant W as Worker

  UI->>API: GET /tickets?page&filters
  API->>DB: consulta ordenada e paginada
  DB-->>API: itens e metadados
  API-->>UI: lista
  alt item visível pending ou processing
    loop a cada 3 segundos enquanto houver item visível pendente
      UI->>API: GET /tickets ou detalhe
      API->>DB: consulta atual
      DB-->>API: estado atual
      API-->>UI: estado atual
      W->>DB: pode concluir SLA entre duas consultas
    end
  else nenhum item visível pendente
    Note over UI: polling fica desativado
  end
```

O polling não é fonte de verdade nem altera estado. Ele apenas observa o valor
persistido pelo Worker e torna `pending`, `processing`, `processed` ou `failed`
visível sem F5.

## Máquinas de estado

### Status de atendimento

```mermaid
stateDiagram-v2
  [*] --> open: criação
  open --> in_progress
  in_progress --> resolved
  resolved --> in_progress: reabertura
  resolved --> closed
  closed --> [*]
```

### Status de processamento do SLA

```mermaid
stateDiagram-v2
  [*] --> pending: criação
  pending --> processing: Worker claim da versão atual
  processing --> processed: SLA persistido
  processing --> processing: falha transitória e novo retry
  processing --> failed: falha definitiva ou tentativas esgotadas
  failed --> pending: reprocessamento
  processed --> pending: prioridade alterada
```

Os dois estados são independentes: resolver ou fechar o atendimento não apaga o
prazo calculado; mudar prioridade pode iniciar novo processamento sem mudar o
status de atendimento.

### Estado da mensagem Outbox

```mermaid
stateDiagram-v2
  [*] --> pending: transação de criação, prioridade ou reprocessamento
  pending --> processing: Dispatcher cria lease
  processing --> published: queue.add confirmado
  processing --> pending: falha ao publicar
  processing --> processing: lease expira e é reivindicado novamente
  published --> [*]
```

## Limites desta representação

- Operações de leitura, filtros e paginação são descritas pelo código e testes,
  não em sequências duplicadas.
- Não há garantia de entrega exatamente uma vez entre PostgreSQL e Redis; a
  garantia é intenção persistida e efeitos idempotentes.
- A BrasilAPI não participa de readiness. A indisponibilidade dela afeta o SLA,
  não a capacidade de consultar ou editar Tickets.
