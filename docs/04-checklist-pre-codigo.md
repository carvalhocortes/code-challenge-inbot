# Checklist pré-código

**Status:** Pronto para implementação

O grilling foi encerrado após confirmar as decisões abaixo. Novas escolhas durante o desenvolvimento devem ser locais, reversíveis e registradas quando alterarem uma fronteira arquitetural.

## Decisões fechadas

- [x] Monólito modular com API e Worker como processos separados.
- [x] Fastify com composição manual.
- [x] PostgreSQL com Drizzle e migrations SQL versionadas.
- [x] BullMQ + Redis.
- [x] Transactional Outbox.
- [x] React por feature, Vite e React Router.
- [x] TanStack Query, estado local React e React Hook Form com resolver Zod.
- [x] TypeScript estrito.
- [x] Zod como contrato de transporte compartilhado.
- [x] Vitest, `fastify.inject` e Playwright.
- [x] Monorepo com `frontend/`, `backend/`, `shared/`, `infra/` e `docs/`.
- [x] pnpm Workspaces.
- [x] Node 22 LTS fixado em Docker e `.nvmrc`.
- [x] Problem Details com `application/problem+json`.
- [x] `If-Match`/`ETag`, `428` sem precondição e `412` para versão divergente.
- [x] Idempotência por hash canônico SHA-256.
- [x] Matriz OWASP Top 10:2025 com evidências e riscos residuais.
- [x] Especificação do front-end com rotas, conteúdo, tokens visuais, estados e BDD.
- [x] Estratégia de dados, demonstração, isolamento e simulação de falhas.
- [x] Plano explícito de evolução para um milhão de acessos.

## Antes do primeiro commit de código

- [ ] Criar `package.json` raiz com `packageManager` e workspaces pnpm.
- [ ] Criar manifests de `frontend`, `backend` e `shared`.
- [ ] Criar `pnpm-workspace.yaml` e `.nvmrc` para Node 22.
- [ ] Criar `docker-compose.yml` com `postgres`, `redis`, `migrate`, `api`, `worker` e `frontend`.
- [ ] Criar `.env.example` com origens, portas, timeout, retry, polling e conexão.
- [ ] Criar schemas Zod compartilhados conforme [contratos HTTP](03-contratos-http.md).
- [ ] Criar `openapi.yaml` OpenAPI 3.1 a partir dos contratos e validá-lo com a skill `openapi-spec-generation`.
- [ ] Criar migration inicial com as quatro tabelas e constraints.
- [ ] Criar health checks e graceful shutdown.
- [ ] Criar o primeiro cenário unitário do cálculo de SLA e o primeiro teste de rota.

## Ordem de implementação

1. Fundação do monorepo e configuração.
2. Domínio puro e relógio injetável.
3. Persistência, migrations e Outbox.
4. API Fastify e contratos.
5. Especificação OpenAPI e documentação interativa.
6. Dispatcher e Worker BullMQ.
7. Integração de feriados com timeout/cache/retry.
8. SPA, conforme [especificação do front-end](05-front-end.md), e polling.
9. Testes de integração, E2E e matriz OWASP.
10. Revisão de documentação, auditoria de dependências e demonstração.
