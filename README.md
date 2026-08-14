# Gestão de Tickets

Plataforma Full Stack para cadastro, acompanhamento e processamento assíncrono de tickets de suporte. Projeto criado para avaliação técnica de Desenvolvedor Full Stack Sênior.

## Estado atual

> [!NOTE]
> A fundação executável (E0) está implementada: monorepo pnpm, API e Worker mínimos, Frontend Vite e Docker Compose. As capacidades de Ticket, migrations e fila ainda serão implementadas nas próximas etapas.

## Objetivos

- Criar e consultar tickets.
- Atualizar status e prioridade com regras explícitas.
- Manter histórico básico e imutável.
- Calcular SLA em segundo plano.
- Integrar com uma API pública de feriados.
- Tratar retry, idempotência e falhas definitivas.
- Atualizar a SPA sem recarregar a página.
- Executar toda a solução com Docker Compose.

## Arquitetura planejada

- Frontend: React e TypeScript, organizado por feature (`features/tickets`).
- Estado do frontend: TanStack Query para dados remotos, React para estado local e React Hook Form para formulários.
- Contratos: Zod para schemas compartilhados e validação em runtime.
- Testes: Vitest, `fastify.inject` e Playwright.
- Segurança: matriz OWASP Top 10:2025 com controles e riscos residuais.
- API: Node.js e TypeScript.
- HTTP: Fastify.
- Worker: processo Node.js separado da API.
- Banco de dados: PostgreSQL.
- Persistência: Drizzle ORM e migrations SQL versionadas.
- Fila: BullMQ com Redis.
- Integração externa: feriados nacionais da BrasilAPI.
- Infraestrutura local: Docker Compose.

API e Worker compartilharão regras e contratos no mesmo monorepo, mas executarão como processos independentes.

Estrutura planejada: `frontend/`, `backend/`, `shared/`, `infra/` e `docs/`. O monorepo usa pnpm Workspaces e versiona `pnpm-lock.yaml`. O runtime será Node 22 LTS.

## Fluxo principal

1. Operador cria ticket pela SPA.
2. API valida e persiste ticket e intenção outbox como `pending`.
3. Dispatcher publica job no BullMQ.
4. Worker consulta feriados e calcula vencimento do SLA.
5. Worker atualiza processamento para `processed` ou `failed`.
6. SPA acompanha mudança por polling, sem F5.

## Documentação

- [Escopo, entrega e especificação BDD](docs/01-escopo-entrega-e-bdd.md)
- [ADR-001 - Stack tecnológica e arquitetura](docs/adr/001-stack-tecnologica-e-arquitetura.md)
- [Contratos HTTP e catálogo de erros](docs/03-contratos-http.md)
- [Matriz de segurança OWASP](docs/02-seguranca-owasp.md)
- [Plano de implementação](docs/04-checklist-pre-codigo.md)
- [Front-end: experiência, páginas e critérios de aceite](docs/05-front-end.md)
- [Estratégia de dados, demonstração e escala](docs/06-estrategia-de-dados-e-escala.md)
- [Índice e governança de ADRs](docs/adr/README.md)
- [Glossário do domínio](CONTEXT.md)
- [Skills e assistência usadas](.agents/README.md)

BDD, contratos HTTP, plano de implementação, front-end e plano de escala são especificações ou planos operacionais. Decisões difíceis de reverter ficam em [`docs/adr/`](docs/adr/README.md); o glossário permanece em `CONTEXT.md`.

## Uso de IA

Uso de IA generativa é permitido pelo desafio. As skills e respectivas versões usadas no refinamento estão incluídas em [`.agents/`](.agents/README.md). Decisões, código e testes permanecem sob revisão humana.

## Respostas às perguntas abertas

### 1. Integração resiliente

Usaria timeout explícito, retry apenas para falhas transitórias, backoff exponencial com jitter e limite de tentativas. Cachearia respostas estáveis e aplicaria rate limit/circuit breaker quando a dependência apresentasse degradação contínua. A chamada ficaria atrás de um adapter, com logs estruturados e métricas de latência, erro e tentativas. Nesta solução, o Worker usa timeout, retry, cache de feriados e estado `failed` reprocessável.

### 2. Refinamento de requisito

Começo identificando ator, objetivo, resultado observável e restrições. Transformo exemplos em cenários BDD, explicito invariantes, estados, erros, métricas e itens fora do escopo. Depois defino contratos de entrada/saída, dependências, riscos e Definition of Done. Valido a fatia vertical com negócio antes de escolher a implementação.

### 3. Idempotência

Exigiria `Idempotency-Key` em comandos que criam efeitos. Persistiria a chave, um hash canônico do payload e a resposta original em transação, com índice único. A mesma chave e payload repetem a resposta sem duplicar efeitos; a mesma chave com payload diferente retorna conflito. Para o processamento assíncrono, usaria identificador determinístico, Outbox e Worker idempotente.

### 4. Síncrono versus assíncrono

Mantenho síncrono quando a operação é curta, determinística e precisa de resposta imediata. Uso fila quando há integração externa, latência variável, retry, volume ou trabalho pesado. A API deve confirmar apenas o que persistiu e retornar estado observável; o Worker conclui o processamento com idempotência. O critério final é experiência do usuário, consistência necessária e custo operacional.

### 5. Segurança

Aplicaria TLS, autenticação e autorização, validação de schema, limite de corpo, rate limit, CORS restritivo e headers de segurança. Usaria queries parametrizadas, segredos fora do código, logs redigidos, dependências auditadas e tratamento uniforme de erros. Também testaria abuso, controle de acesso, injeção e exposição de dados. Nesta demonstração, autenticação/autorização ficam fora do escopo e são declaradas como risco residual.

### 6. Qualidade e entrega

Priorizo uma fatia vertical que prove o maior risco técnico e o fluxo de negócio principal. Defino Definition of Done com testes, observabilidade, execução reproduzível e tratamento de falhas. O que não é necessário para essa prova vira item fora do escopo ou débito técnico registrado, com impacto e próximo passo. Evito adicionar abstração sem uma necessidade demonstrada.

### 7. Governança e IA

Não envio segredos, dados pessoais ou código confidencial para ferramentas sem autorização. Uso IA para explorar alternativas e acelerar rascunhos, mas reviso diffs, licenças, dependências, segurança e comportamento. Cada decisão precisa de teste ou evidência executável e permanece sob responsabilidade humana. As skills usadas neste projeto estão versionadas em [`.agents/`](.agents/README.md).

## Plano para um milhão de acessos

O escopo atual cobre fundamentos que evitam gargalos prematuros: API e Worker stateless em processos separados, paginação, índices orientados aos filtros, payloads limitados, processamento assíncrono, Outbox, retry, cache de feriados, polling condicional e configuração por ambiente. Isso não equivale a afirmar capacidade para um milhão sem carga medida.

O plano de evolução, com premissas e etapas de medição, está em [docs/06-estrategia-de-dados-e-escala.md](docs/06-estrategia-de-dados-e-escala.md). A primeira etapa será definir tráfego, concorrência, tamanho dos dados e SLOs; depois medir com carga antes de escolher réplicas, cache ou particionamento.

## Como iniciar

### Fundação E0

Pré-requisitos: Node 22, Corepack e Docker Compose.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up --build
```

Nesta etapa, o Frontend em `http://localhost:5173` apresenta apenas a casca da aplicação. A API expõe `GET /health/live` e `GET /health/ready` em `http://localhost:3000`; não existem endpoints de Ticket ainda.

Para validar o código fora do Docker:

```bash
pnpm build
pnpm typecheck
pnpm test
```

As migrations reais entram na E2. Até lá, o serviço `migrate` apenas verifica que o PostgreSQL está acessível antes de liberar API e Worker.

## Testes planejados

- Unitários para regras de status e cálculo de SLA.
- Integração para API, PostgreSQL, fila e Worker.
- Interface para estados assíncronos e conflitos.
- Ponta a ponta para fluxo criação, processamento e atualização sem reload.

Cenários Gherkin funcionam como contratos de comportamento e critérios de aceite.

## Escopo excluído

- Kafka e microservices.
- Autenticação e autorização.
- Kubernetes e deployment em cloud.
- WebSocket e Server-Sent Events.
- Event sourcing e CQRS.
- Dashboard analítico e aplicativo mobile.

Lista completa e justificativas estão na documentação de escopo.

## Entrega final prevista

- Código-fonte versionado.
- Execução completa via Docker Compose.
- Migrations e `.env.example`.
- Testes automatizados dos fluxos críticos.
- Respostas das perguntas abertas da avaliação.
- Decisões arquiteturais e trade-offs.
- Contrato OpenAPI validado e documentação HTTP.
- Plano de evolução para alto volume.
- Roteiro reproduzível de demonstração.
