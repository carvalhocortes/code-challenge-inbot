# Gestão de Tickets InBot

Aplicação full stack para criar, acompanhar e conduzir tickets de suporte. A API persiste o Ticket e uma intenção de processamento na mesma transação; um Worker calcula o SLA em segundo plano e a SPA acompanha o resultado sem recarga manual.

## O que está implementado

- Criação idempotente com `Idempotency-Key`, histórico imutável e processamento assíncrono por Outbox e BullMQ.
- Consulta, filtros, paginação, detalhe, alteração de status/prioridade e reprocessamento com concorrência otimista por `ETag`/`If-Match`.
- Cálculo de SLA em horário útil brasileiro, incluindo fins de semana e feriados, com cache, retry e falha definitiva observável.
- SPA React organizada em Feature-Sliced Design, com estados de carregamento, erro, conflito persistente, teclado e layout responsivo.
- Seed idempotente, testes unitários, integrações PostgreSQL/Redis reais e Playwright em ambiente temporário.

## Pré-requisitos

- Node.js 22
- Corepack
- Docker Compose

## Início rápido

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
docker compose --env-file .env up --build --wait
```

Depois, abra a SPA em `http://localhost:5173`. A API fica em `http://localhost:3000`.

| Serviço    | Porta padrão | Health check                             |
| ---------- | ------------ | ---------------------------------------- |
| Frontend   | 5173         | `http://localhost:5173`                  |
| API        | 3000         | `GET /health/live` e `GET /health/ready` |
| PostgreSQL | 5432         | `pg_isready`                             |
| Redis      | 6379         | `redis-cli ping`                         |

Para encerrar e manter os dados locais:

```bash
docker compose down
```

Para também remover os volumes locais:

```bash
docker compose down --volumes
```

## Variáveis relevantes

Copie `.env.example` para `.env`; ele contém somente credenciais locais de desenvolvimento. Não versione o arquivo `.env`.

| Variável                | Padrão                  | Uso                                                                                                               |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGIN`           | `http://localhost:5173` | Origem permitida para a SPA.                                                                                      |
| `HOLIDAY_PROVIDER_MODE` | `brasil-api`            | `brasil-api` usa BrasilAPI; `success`, `timeout`, `429`, `500` e `400` são modos determinísticos de demonstração. |
| `SLA_RETRY_ATTEMPTS`    | `3`                     | Número máximo de tentativas BullMQ.                                                                               |
| `SLA_RETRY_BACKOFF_MS`  | `1000`                  | Base do backoff exponencial em milissegundos.                                                                     |

`HOLIDAY_PROVIDER_MODE` é lido pelo Worker. Para trocar o modo de uma demonstração em execução, recrie somente o Worker com a variável desejada.

## Seed de desenvolvimento

O seed é separado das migrations e pode ser executado repetidas vezes. Ele insere quatro Tickets sintéticos com prioridades, status de atendimento e estados de processamento diferentes. Não cria chaves de idempotência nem mensagens de Outbox artificiais.

Com o Compose em execução:

```bash
docker compose exec api pnpm --filter @inbot/backend db:seed
```

Fora do Docker, com PostgreSQL e Redis locais configurados no `.env`:

```bash
corepack pnpm db:seed
```

## Testes e verificações

```bash
# Tipos e builds de todos os workspaces
corepack pnpm typecheck
corepack pnpm build

# Unitários e integrações; as integrações usam Testcontainers
corepack pnpm --dir backend test
corepack pnpm --dir frontend test
corepack pnpm --dir shared test

# E2E: cria Compose isolado nas portas 3100/5174 e o remove ao final
corepack pnpm test:e2e

# Dependências de produção
corepack pnpm audit --prod
```

O E2E usa `HOLIDAY_PROVIDER_MODE=success`, cria um Ticket pela SPA, aguarda o cálculo de SLA e altera o status. O banco, Redis e filas pertencem ao projeto Compose `inbot-e2e`, isolado do ambiente local normal.

## Roteiro de demonstração

O roteiro verificável de criação, idempotência, retry, falha e reprocessamento está em [docs/07-evidencias-e-demonstracao.md](docs/07-evidencias-e-demonstracao.md).

## Segurança e limites

A matriz de controles está em [docs/02-seguranca-owasp.md](docs/02-seguranca-owasp.md) e a evidência da revisão E8 está em [docs/07-evidencias-e-demonstracao.md](docs/07-evidencias-e-demonstracao.md#segurança-e-auditoria-de-dependências).

Esta é uma demonstração local. Autenticação, autorização por Ticket, TLS de produção, WAF, DAST, SCA contínuo, alerting centralizado e gestão de segredos em cloud não estão implementados. Não exponha a aplicação publicamente como se esses controles existissem.

## Arquitetura e documentação

- [Escopo e cenários BDD](docs/01-escopo-entrega-e-bdd.md)
- [Matriz OWASP](docs/02-seguranca-owasp.md)
- [Contrato HTTP e Problem Details](docs/03-contratos-http.md)
- [Checklist de implementação](docs/04-checklist-pre-codigo.md)
- [Experiência da SPA](docs/05-front-end.md)
- [Dados, escala e demonstração](docs/06-estrategia-de-dados-e-escala.md)
- [Decisões arquiteturais](docs/adr/README.md)
- [Glossário](CONTEXT.md)

## Escopo excluído

Não fazem parte desta entrega: autenticação/autorização, multitenancy, anexos, notificações, WebSocket/SSE, analytics, Kafka, microsserviços, Kubernetes, deployment em cloud, event sourcing, CQRS e otimizações de escala sem medição.
