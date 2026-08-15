# Implantação e operação local — Gestão de Tickets InBot

**Público:** pessoas que executam, demonstram ou diagnosticam o ambiente local.

Este é um diagrama de implantação local, não uma topologia de produção. Ele
descreve o Docker Compose que sobe PostgreSQL, Redis, migrations, API, Worker e
Frontend.

## Topologia Docker Compose

```mermaid
flowchart LR
  operator["Operador / avaliador"]
  brasil["BrasilAPI"]
  subgraph compose["Docker Compose local"]
    frontend["frontend\nVite preview :5173"]
    api["api\nFastify :3000"]
    worker["worker\nBullMQ"]
    migrate["migrate\nDrizzle, execução única"]
    postgres[("postgres :5432\nvolume postgres-data")]
    redis[("redis :6379\nvolume redis-data")]
  end

  operator -->|"navegador :5173"| frontend
  operator -->|"curl :3000"| api
  frontend -->|"VITE_API_BASE_URL"| api
  api -->|"SQL"| postgres
  api -->|"readiness e Redis client"| redis
  worker -->|"SQL"| postgres
  worker -->|"fila ticket-sla"| redis
  worker -->|"HTTPS, quando modo brasil-api"| brasil
  migrate -->|"aplica migrations"| postgres
  postgres -. "saudável" .-> migrate
  migrate -. "concluído" .-> api
  migrate -. "concluído" .-> worker
  postgres -. "saudável" .-> api
  postgres -. "saudável" .-> worker
  redis -. "saudável" .-> api
  redis -. "saudável" .-> worker
  api -. "GET /health/ready" .-> frontend
```

| Serviço    | Porta publicada | Estado de saúde                         | Papel                                                              |
| ---------- | --------------: | --------------------------------------- | ------------------------------------------------------------------ |
| `frontend` |            5173 | `fetch http://localhost:5173`           | Entrega a SPA compilada.                                           |
| `api`      |            3000 | `GET /health/ready`                     | Expõe API HTTP; só fica pronta com PostgreSQL e Redis disponíveis. |
| `worker`   |   não publicada | Não há health check próprio no Compose. | Publica Outbox e processa SLA.                                     |
| `migrate`  |   não publicada | Execução única bem-sucedida.            | Aplica migrations antes de API e Worker.                           |
| `postgres` |            5432 | `pg_isready`                            | Fonte de verdade, persistida em `postgres-data`.                   |
| `redis`    |            6379 | `redis-cli ping`                        | Fila BullMQ, persistida em `redis-data`.                           |

As portas de PostgreSQL e Redis são publicadas para desenvolvimento local. Isso
não é uma política de rede para produção.

## Ordem de partida e prontidão

```mermaid
sequenceDiagram
  participant P as postgres
  participant R as redis
  participant M as migrate
  participant A as api
  participant W as worker
  participant F as frontend

  P-->>M: healthcheck aprovado
  M->>P: drizzle-kit migrate
  M-->>A: serviço concluído com sucesso
  M-->>W: serviço concluído com sucesso
  P-->>A: saudável
  R-->>A: saudável
  P-->>W: saudável
  R-->>W: saudável
  A->>P: SELECT 1
  A->>R: connect e PING
  A-->>F: /health/ready = 200
  F-->>F: inicia após API saudável
```

`GET /health/live` apenas confirma que o processo HTTP responde. `GET
/health/ready` verifica PostgreSQL e Redis; a BrasilAPI não bloqueia readiness,
pois ela é consumida pelo Worker no momento do cálculo.

## Configuração por processo

| Grupo         | API                                                     | Worker                                       |
| ------------- | ------------------------------------------------------- | -------------------------------------------- |
| Conexões      | `DATABASE_URL`, `REDIS_URL`                             | `DATABASE_URL`, `REDIS_URL`                  |
| HTTP          | `API_PORT`, `CORS_ORIGIN`, limite de corpo e rate limit | Não se aplica                                |
| Outbox e fila | Não se aplica                                           | intervalo, lote, lease, tentativas e backoff |
| Feriados      | Não se aplica                                           | modo, timeout e TTL de cache                 |

`HOLIDAY_PROVIDER_MODE=brasil-api` usa o provedor real. Os modos `success`,
`timeout`, `429`, `500` e `400` tornam demonstrações e testes de falha
reproduzíveis sem depender da internet.

## Fluxo de diagnóstico

```mermaid
flowchart TD
  start["API indisponível ou SLA não conclui"] --> ready{"/health/ready retorna 200?"}
  ready -->|"não"| runtime["Verificar PostgreSQL e Redis\nlogs da API e health checks"]
  ready -->|"sim"| pending{"Ticket está pending ou processing?"}
  pending -->|"não, failed"| reprocess["Ver modo de feriados e logs do Worker\nCorrigir causa e reprocessar com ETag atual"]
  pending -->|"sim"| worker["Verificar Worker, Outbox pending\ne fila ticket-sla no Redis"]
  worker --> provider{"Modo brasil-api?"}
  provider -->|"sim"| external["Verificar timeout, conectividade\ne resposta da BrasilAPI"]
  provider -->|"não"| mode["Confirmar HOLIDAY_PROVIDER_MODE\ne reiniciar somente o Worker"]
```

## Limites operacionais conhecidos

- O Compose não configura TLS, balanceador, rede privada, secret manager ou
  alta disponibilidade.
- O Worker não tem endpoint HTTP nem health check próprio no Compose; logs e o
  estado observável do Ticket são a evidência atual de processamento.
- O cache de feriados é local à instância do Worker.
- Para um cenário de carga real, o plano é medir antes de adicionar réplicas,
  cache distribuído ou serviços gerenciados.
