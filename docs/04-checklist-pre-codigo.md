# Plano de implementação

**Status:** Pronto para implementação

**Versão:** 0.2

**Data:** 2026-08-14

## 1. Objetivo e regra de execução

Este é o plano operacional da primeira versão do Centro de tickets. Ele transforma os requisitos aceitos em incrementos pequenos e verificáveis; não altera escopo, contratos ou decisões arquiteturais já aprovadas.

Cada etapa só é considerada concluída quando seu critério de aceite estiver demonstrado por código, teste ou execução local. Não iniciaremos uma capacidade dependente de infraestrutura simulada quando a etapa anterior já exige PostgreSQL, Redis ou um contrato executável. Uma descoberta que mude escopo, contrato público ou fronteira arquitetural deve atualizar o documento de origem e, se for uma decisão difícil de reverter, uma ADR antes de seguir.

## 2. Fontes de verdade

| Tema | Documento de referência | Uso no plano |
| --- | --- | --- |
| Escopo, regras e BDD | [01 - Escopo e BDD](01-escopo-entrega-e-bdd.md) | Define comportamento obrigatório e fora de escopo. |
| Contratos HTTP e jobs | [03 - Contratos HTTP](03-contratos-http.md) | Define schemas, headers, respostas e erros observáveis. |
| Arquitetura e tecnologias | [ADR-001](adr/001-stack-tecnologica-e-arquitetura.md) | Define fronteiras, stack e trade-offs aceitos. |
| Segurança | [02 - Segurança OWASP](02-seguranca-owasp.md) | Define controles mínimos e sua evidência. |
| Experiência da SPA | [05 - Front-end](05-front-end.md) | Define rotas, estados, acessibilidade e aceitação visual. |
| Dados, falhas e escala | [06 - Dados e escala](06-estrategia-de-dados-e-escala.md) | Define seed, fakes, isolamento e demonstração. |
| Vocabulário | [CONTEXT.md](../CONTEXT.md) | Mantém nomes consistentes no código, testes e interface. |

## 3. Sequência de entrega

```text
Fundação → Domínio e contratos → Persistência → API síncrona
    → Outbox e Worker → Integração resiliente → SPA
    → Testes completos e entrega reproduzível
```

A primeira fatia demonstrável é a criação de um Ticket com estado `pending` persistido. A primeira fatia de ponta a ponta é criar pela SPA, publicar pela outbox, calcular o SLA no Worker e observar `processed` sem F5. Recursos de refinamento visual, seed e roteiro de demonstração entram depois que esse fluxo estiver íntegro.

## 4. Etapas e critérios de aceite

### E0 — Fundação reproduzível

**Status:** Concluída em 2026-08-14.

**Objetivo:** criar o monorepo executável sem adicionar regra de negócio.

**Entregáveis:**

- `package.json` raiz, `pnpm-workspace.yaml`, `.nvmrc` para Node 22 e lockfile versionado.
- Workspaces `frontend/`, `backend/` e `shared/`; `infra/` para Dockerfiles, Compose e scripts operacionais.
- TypeScript estrito, lint/formatação escolhidos de forma mínima e comandos raiz para build, testes e execução.
- `.env.example` validável, sem segredos, e Docker Compose com PostgreSQL, Redis, migration, API, Worker e Frontend.
- Factories de inicialização separadas para API e Worker, health checks e desligamento gracioso.

**Aceite:** instalação limpa, build e testes vazios passam; `docker compose up --build` deixa os serviços essenciais saudáveis; nenhum segredo é necessário ou versionado.

### E1 — Contratos executáveis e domínio puro

**Objetivo:** tornar as regras mais arriscadas independentes de HTTP, banco e fila.

**Entregáveis:**

- Schemas Zod em `shared/` para requests, responses, queries, Problem Details e payload do job `ticket-sla`.
- Tipos canônicos de Ticket, prioridade, status de atendimento, status de processamento e Histórico do Ticket.
- Relógio injetável, calendário útil e cálculo de SLA por prioridade, incluindo virada de dia, fim de semana e feriado.
- Regras puras de transição de status, alteração de prioridade, versão e classificação de falha transitória/definitiva.
- Testes unitários que implementam primeiro os cenários BDD marcados como `@unit`.

**Aceite:** os casos de calendário, transição inválida e Ticket fechado são determinísticos; o domínio não importa Fastify, Drizzle, BullMQ, React ou a BrasilAPI.

### E2 — Persistência transacional

**Objetivo:** garantir que o banco proteja invariantes e que não exista Ticket sem intenção persistida de cálculo.

**Entregáveis:**

- Migrations SQL versionadas e schema Drizzle para `tickets`, `ticket_history`, `idempotency_keys` e `outbox_messages`.
- Constraints, índices e consultas compatíveis com busca, filtros, ordenação `createdAt DESC, id DESC` e paginação.
- Repositórios e casos de uso que criam Ticket, chave idempotente, histórico e outbox na mesma transação.
- Hash canônico SHA-256, replay da criação e proteção contra reuso de chave com corpo diferente.
- Atualizações condicionadas por `id` e `version`, incluindo criação de Histórico do Ticket e nova intenção de processamento ao mudar prioridade.

**Aceite:** testes de integração com PostgreSQL real provam atomicidade, unicidade de idempotência, replay sem duplicação, conflito de versão e imutabilidade do histórico.

### E3 — API HTTP síncrona

**Objetivo:** expor o fluxo de tickets com o contrato público estável, sem ainda depender da conclusão do Worker.

**Entregáveis:**

- Factory Fastify, parsing Zod, `requestId`, logging estruturado/redigido, CORS, Helmet, limites de corpo e rate limit configurável.
- Problem Details centralizado, com catálogo de códigos estáveis e sem exposição de stack trace, SQL ou segredo.
- Rotas `POST /tickets`, `GET /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id/status`, `PATCH /tickets/:id/priority`, `POST /tickets/:id/reprocess` e health checks.
- `Idempotency-Key`, `ETag` e `If-Match` implementados exatamente como definidos no contrato.

**Aceite:** testes por `fastify.inject` cobrem sucesso, validação, `404`, `409`, `412`, `422` e `428`; a criação retorna `201` com Ticket `open` e `pending`, mesmo antes de qualquer trabalho na fila.

### E4 — Outbox, Dispatcher e Worker idempotente

**Objetivo:** completar a separação operacional API/Worker sem perder intenções entre PostgreSQL e Redis.

**Entregáveis:**

- Dispatcher com busca em lote, estados `pending`/`processing`/`published`, lease recuperável e parâmetros configuráveis.
- Fila BullMQ `ticket-sla`, `jobId` determinístico e payload sem e-mail ou descrição.
- Worker que valida o payload, evita recalcular uma versão concluída, atualiza os estados de processamento e persiste `slaDueAt`.
- Recuperação de queda entre publicação e confirmação, tolerando publicação repetida sem efeitos de negócio duplicados.

**Aceite:** um teste integrado prova que uma criação chega ao Worker e termina em `processed`; outro prova que replay de job e recuperação da outbox não duplicam histórico, cálculo nem efeito persistido.

### E5 — Feriados, cache e falhas controladas

**Objetivo:** fazer a dependência externa falhar de forma previsível e recuperável.

**Entregáveis:**

- Porta de feriados, adapter BrasilAPI com `fetch` e `AbortController`, validação da resposta e timeout configurável.
- Cache por ano com TTL e uso de valor válido durante indisponibilidade do provedor.
- Fake configurável com os modos `success`, `timeout`, `429`, `500` e `400`.
- Retry BullMQ com backoff exponencial configurável para timeout, conexão, `429` e `5xx`; marcação `failed` após o limite e reprocessamento permitido pelo contrato.

**Aceite:** testes usam somente fake; provam classificação correta de retry, falha definitiva, cache e recuperação por reprocessamento. O smoke test manual da BrasilAPI é separado e opcional quando não houver internet.

### E6 — SPA: consulta e criação

**Objetivo:** entregar a primeira experiência completa do operador, a partir da API real.

**Entregáveis:**

- Shell, rotas e tokens visuais definidos em [05 - Front-end](05-front-end.md), incluindo skip link, landmarks e foco visível.
- Central `/tickets` com carregamento, vazio, erro, busca, filtros, paginação, tabela desktop e cartões mobile.
- Formulário `/tickets/new` com React Hook Form, schemas compartilhados, mensagens acessíveis e geração de `Idempotency-Key` por tentativa lógica.
- Cliente HTTP tipado, TanStack Query e polling de três segundos exclusivamente enquanto houver `pending` ou `processing` visível.

**Aceite:** o operador cria um Ticket válido pela SPA, navega ao detalhe e vê `Aguardando cálculo`; formulário inválido não envia request e estados de carregamento/erro não dependem só de cor.

### E7 — SPA: detalhe, ações e histórico

**Objetivo:** permitir conduzir o atendimento sem duplicar regra de negócio no navegador.

**Entregáveis:**

- Detalhe `/tickets/:id` com SLA, sinal de processamento, informações do solicitante, ações contextualizadas e linha do tempo de Histórico do Ticket.
- Mutações de status, prioridade e reprocessamento enviando `If-Match`, atualizando ETag e invalidando as consultas afetadas.
- Estado persistente de conflito para `409`/`412`, com ação explícita de recarregar; estado seguro para falha definitiva e reprocessamento.
- Revisão de teclado, contraste, responsividade e `prefers-reduced-motion`.

**Aceite:** a SPA mostra a transição permitida, bloqueia a ação indevida segundo a resposta da API, torna conflito visível fora de toast efêmero e atualiza o processamento sem F5.

### E8 — Qualidade, segurança e demonstração

**Objetivo:** fechar a entrega com evidência executável e documentação honesta.

**Entregáveis:**

- Seed idempotente, sem PII real, que cobre os estados de negócio e processamento previstos.
- Suítes unitária, integração e Playwright alinhadas aos cenários BDD de maior risco.
- Isolamento de PostgreSQL, Redis, relógio e fila entre testes; sem `sleep` arbitrário longo para retry.
- Verificação dos controles OWASP aplicáveis, auditoria de dependências e revisão de logs/redaction.
- README atualizado com pré-requisitos, portas, variáveis, comandos reais, migrations, testes, diagnóstico e limites assumidos.
- Roteiro de demonstração do sucesso, idempotência, retry, falha e reprocessamento.

**Aceite:** `docker compose up --build`, migrations, build e todas as suítes automatizadas passam em ambiente limpo; a demonstração percorre o roteiro de [06 - Dados e escala](06-estrategia-de-dados-e-escala.md) sem passos manuais ocultos.

## 5. Ordem de testes

| Nível | Executado a partir de | Protege principalmente |
| --- | --- | --- |
| Unitário | E1 e continuamente | Calendário, SLA, transições, prioridade e classificação de falhas. |
| Integração | E2 e continuamente | Transações, constraints, contratos HTTP, outbox, Redis e Worker. |
| E2E | E6 e continuamente | Criação pela SPA, polling, processamento concluído e erro visível. |
| Manual controlado | E5 e E8 | Smoke da BrasilAPI, teclado, responsividade e roteiro de apresentação. |

Não há meta de cobertura percentual isolada. Um cenário BDD crítico sem automação precisa ter justificativa e passo manual registrado no README antes da entrega.

## 6. Limites de escopo durante a implementação

As etapas acima não autorizam adicionar autenticação, perfis, multitenancy, anexos, notificações, WebSocket/SSE, analytics, Kafka, microservices, Kubernetes ou otimizações preventivas para alto volume. Esses itens permanecem fora do escopo definido em [01 - Escopo e BDD](01-escopo-entrega-e-bdd.md).

Também não trataremos Redis como fonte de verdade, `shared/` como depósito de regras de negócio, nem o Frontend como autoridade para transições ou cálculo de SLA.

## 7. Marco de pronto para entrega

A versão só estará pronta quando todos os itens abaixo forem verdadeiros:

- [ ] E0 a E8 concluídas com os respectivos critérios de aceite.
- [ ] Fluxo crítico demonstrável: criar, persistir, publicar, calcular SLA, atualizar a SPA e consultar histórico.
- [ ] Idempotência, concorrência otimista, outbox, retry e falha definitiva têm testes de comportamento.
- [ ] Segurança mínima e riscos residuais estão coerentes entre código, README e matriz OWASP.
- [ ] Ambiente reproduzível por Docker Compose, sem segredos no repositório.
- [ ] README descreve apenas capacidades verificadas e limitações reais.

## 8. Próximo incremento

O próximo trabalho é **E1 — Contratos executáveis e domínio puro**. Ele começa pelos testes do cálculo de SLA antes de integrar banco, fila ou UI.
