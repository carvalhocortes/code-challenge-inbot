# Gestão de Tickets - Escopo, Entrega e Especificação BDD

**Status:** Aceito para implementação

**Versão:** 0.1

**Data:** 2026-08-13

**Objetivo:** definir o que será construído, o que ficará fora da entrega e como cada comportamento será validado antes do início da implementação.

## 1. Contexto

O desafio pede uma aplicação Full Stack para gestão de tickets, com API Node.js, SPA React, persistência local, processamento assíncrono em fila, integração com API pública, atualização da interface sem recarregar a página e execução completa via Docker Compose.

A entrega será uma fatia vertical pequena, funcional e demonstrável. O foco não será quantidade de funcionalidades, mas clareza das regras, separação de responsabilidades, resiliência, testes e documentação dos trade-offs.

## 2. Objetivo do produto

Permitir que um operador de suporte:

1. Cadastre um ticket com dados válidos e prioridade.
2. Consulte tickets usando busca, filtros e paginação.
3. Atualize status e prioridade respeitando regras explícitas.
4. Consulte o histórico básico de alterações.
5. Acompanhe o cálculo assíncrono do prazo de SLA sem atualizar manualmente a página.
6. Entenda e recupere falhas definitivas do processamento.

## 3. Resultado esperado da avaliação

A solução deverá demonstrar:

- Decisões proporcionais ao tempo disponível de 12 a 18 horas úteis.
- Separação entre API HTTP e Worker.
- Processamento assíncrono real usando fila.
- Regras de domínio fora de controllers e componentes visuais.
- Tratamento explícito de falhas transitórias e definitivas.
- Idempotência na criação e no processamento.
- Persistência consistente e histórico rastreável.
- API com validação, paginação e erros previsíveis.
- SPA que representa estados assíncronos com clareza.
- Testes focados nos fluxos de maior risco.
- Ambiente reproduzível com um comando.

## 4. Atores

### 4.1 Operador de suporte

Ator humano principal. Cadastra, consulta e atualiza tickets. Nesta entrega não existe autenticação real; portanto, o sistema não alegará possuir auditoria nominal de usuários.

### 4.2 API HTTP

Recebe comandos e consultas, valida entradas, persiste alterações e publica trabalhos assíncronos. Não calcula SLA nem chama diretamente a API pública durante a requisição de criação.

### 4.3 Worker de processamento

Consome trabalhos da fila, consulta feriados, calcula o vencimento do SLA e atualiza o estado técnico do ticket. Deve ser seguro contra execução repetida.

### 4.4 Serviço de mensageria

Redis com BullMQ. Mantém trabalhos, tentativas e backoff entre a API e o Worker.

### 4.5 Provedor externo de feriados

BrasilAPI, endpoint `GET /api/feriados/v1/{ano}`. Fornece feriados nacionais usados pelo cálculo de horas úteis. A integração ficará atrás de uma interface própria para permitir testes e substituição do provedor.

### 4.6 Avaliador técnico

Executa a aplicação, inspeciona código e testes, provoca falhas e questiona decisões. Não é ator do domínio, mas seus fluxos de verificação fazem parte dos entregáveis.

## 5. Glossário

| Termo                   | Definição                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Ticket                  | Solicitação de suporte persistida pelo sistema.                                                           |
| Prioridade              | Urgência do ticket: `critical`, `high`, `medium` ou `low`.                                                |
| Status de negócio       | Etapa do atendimento: `open`, `in_progress`, `resolved` ou `closed`.                                      |
| Status de processamento | Estado técnico do cálculo de SLA: `pending`, `processing`, `processed` ou `failed`.                       |
| SLA                     | Prazo máximo desta demonstração para resolução, calculado em horas úteis.                                 |
| Horário útil            | Segunda a sexta-feira, das 09:00 às 18:00, no fuso `America/Sao_Paulo`, exceto feriados nacionais.        |
| Histórico               | Registro imutável de criação e alterações de status ou prioridade.                                        |
| Job                     | Unidade de processamento publicada no BullMQ.                                                             |
| Falha transitória       | Timeout, indisponibilidade, HTTP `429` ou HTTP `5xx`, passível de nova tentativa.                         |
| Falha definitiva        | Erro não recuperado após o limite de tentativas ou resposta que não deve ser repetida.                    |
| Idempotência            | Garantia de que repetir a mesma operação não duplica seus efeitos.                                        |
| Outbox                  | Registro persistido na mesma transação do Ticket que representa uma intenção ainda não publicada na fila. |

## 6. Escopo funcional obrigatório

### 6.1 Cadastro de ticket

Campos informados pelo operador:

- `title`: obrigatório, entre 3 e 120 caracteres após normalização.
- `description`: obrigatório, entre 10 e 2.000 caracteres após normalização.
- `requesterEmail`: obrigatório e validado como endereço de e-mail.
- `priority`: obrigatória e limitada aos valores definidos.

Campos controlados pelo sistema:

- `id`: UUID.
- `status`: inicia como `open`.
- `processingStatus`: inicia como `pending`.
- `slaDueAt`: inicia vazio.
- `version`: inicia em `1` e suporta concorrência otimista.
- `createdAt` e `updatedAt`: datas em UTC.

A criação concluída retorna `201 Created`, pois o ticket já existe, mesmo que o cálculo de SLA ainda esteja pendente.

### 6.2 Idempotência da criação

- `POST /tickets` aceitará o header `Idempotency-Key`.
- Repetição da mesma chave com o mesmo conteúdo retorna o ticket original.
- A repetição não cria segundo ticket, segundo histórico ou segundo job efetivo.
- Mesma chave com conteúdo diferente retorna `409 Conflict`.
- A chave terá unicidade persistida no banco.

### 6.3 Consulta e filtros

- Lista paginada com `page` e `pageSize`.
- `pageSize` padrão de 10 e máximo de 100.
- Busca textual `q` em título e descrição.
- Filtros por status e prioridade.
- Ordenação estável por `createdAt DESC, id DESC`.
- Consulta individual de ticket com histórico.
- Índices de banco coerentes com filtros e ordenação.

Paginação por cursor ficará como evolução para volumes altos. Paginação por página é suficiente para a demonstração e será discutida no plano para um milhão de acessos.

### 6.4 Atualização de status

Transições permitidas:

- `open` para `in_progress`.
- `in_progress` para `resolved`.
- `resolved` para `in_progress`, representando reabertura.
- `resolved` para `closed`.

Qualquer outra transição será rejeitada com `409 Conflict`. Repetir comando que mantém o mesmo status não cria novo histórico.

### 6.5 Atualização de prioridade

- A prioridade pode mudar enquanto o ticket não estiver `closed`.
- Alterar prioridade cria histórico.
- Alterar prioridade marca o processamento como `pending` e solicita novo cálculo de SLA.
- O novo SLA continua usando `createdAt` como origem. Ele não reinicia na alteração de prioridade.
- Ticket fechado não aceita alteração de prioridade.

### 6.6 Concorrência otimista

- Atualizações exigirão a versão atualmente conhecida do ticket.
- Atualização bem-sucedida incrementa `version`.
- Versão desatualizada retorna `412 Precondition Failed` com erro estável.
- O cliente deve recarregar o ticket antes de tentar nova alteração.

### 6.7 Histórico

O histórico será somente de inclusão e conterá:

- Criação do ticket.
- Alteração de status, com valor anterior e novo.
- Alteração de prioridade, com valor anterior e novo.
- Data em UTC.
- Origem `operator` ou `system`.

O histórico não poderá ser alterado ou removido pela API. Tentativas técnicas do Worker ficarão nos logs e metadados da fila, não no histórico de negócio.

### 6.8 Cálculo de SLA

Metas iniciais:

| Prioridade |          Prazo |
| ---------- | -------------: |
| `critical` |  4 horas úteis |
| `high`     |  8 horas úteis |
| `medium`   | 24 horas úteis |
| `low`      | 48 horas úteis |

Regras:

- Horário útil: 09:00 até 18:00.
- Dias úteis: segunda a sexta-feira.
- Fuso: `America/Sao_Paulo`.
- Feriados nacionais são excluídos.
- Feriados estaduais e municipais não fazem parte da entrega.
- Cálculo começa em `createdAt`.
- Resolução ou fechamento não apaga `slaDueAt`.
- A interface pode indicar ticket vencido comparando o relógio atual com `slaDueAt`, exceto quando estiver `resolved` ou `closed`.
- Testes usam relógio injetável; não dependem da hora real da máquina.

### 6.9 Processamento assíncrono

Fluxo de criação:

1. API valida a requisição.
2. API abre transação PostgreSQL.
3. API persiste ticket, chave idempotente, histórico e intenção outbox.
4. API confirma a transação e responde sem aguardar processamento externo.
5. Dispatcher do Worker publica job identificado pelo ticket e versão de processamento.
6. Dispatcher marca o registro outbox como publicado.
7. Worker marca processamento como `processing`.
8. Worker obtém feriados necessários.
9. Worker calcula e persiste `slaDueAt`.
10. Worker marca processamento como `processed`.
11. SPA atualiza o ticket sem F5.

O job será idempotente. Se recebido novamente depois de concluir a mesma versão, deverá encerrar sem recalcular ou duplicar efeitos.

### 6.10 Retry e falha definitiva

- Até três tentativas automáticas.
- Backoff exponencial configurável.
- Timeout da API externa configurável.
- Retry para timeout, erro de conexão, HTTP `429` e HTTP `5xx`.
- Sem retry para respostas HTTP `4xx`, exceto `429`.
- Depois da última tentativa, `processingStatus` torna-se `failed`.
- O ticket continua consultável e editável quando o cálculo falha.
- A interface exibe falha sem revelar detalhes internos.
- Operador pode solicitar reprocessamento do ticket.
- Reprocessamento de ticket já concluído exige que exista nova versão pendente ou falha; não duplica processamento concluído.

### 6.11 Cache de feriados

- Feriados serão armazenados em cache por ano.
- Cache reduz chamadas repetidas e exposição a rate limiting.
- TTL será configurável, com padrão de 24 horas.
- Cache existente poderá ser usado durante indisponibilidade do provedor.
- Sem cache válido, falhas do provedor seguem a política de retry.

### 6.12 SPA React

A interface conterá:

- Formulário de criação.
- Lista paginada.
- Busca textual.
- Filtros por status e prioridade.
- Visualização dos status de negócio e processamento.
- Atualização de status e prioridade.
- Visualização de histórico.
- Ação de reprocessamento quando houver falha.
- Mensagens claras para carregamento, vazio, validação, conflito e falha.

A SPA usará polling periódico somente enquanto existirem itens `pending` ou `processing` visíveis. Intervalo inicial: 3 segundos. WebSocket e Server-Sent Events não serão usados nesta entrega.

Rotas, conteúdo de cada página, direção visual, estados de interface, acessibilidade e cenários BDD do front estão especificados em [05-front-end.md](05-front-end.md). A página de detalhe tratará `412`/`409` como conflito visível e o formulário enviará `Idempotency-Key`.

### 6.13 API HTTP prevista

| Método  | Rota                     | Finalidade                                        |
| ------- | ------------------------ | ------------------------------------------------- |
| `POST`  | `/tickets`               | Criar ticket de forma idempotente.                |
| `GET`   | `/tickets`               | Listar, buscar, filtrar e paginar.                |
| `GET`   | `/tickets/:id`           | Consultar ticket e histórico.                     |
| `PATCH` | `/tickets/:id/status`    | Executar transição de status.                     |
| `PATCH` | `/tickets/:id/priority`  | Alterar prioridade e recalcular SLA.              |
| `POST`  | `/tickets/:id/reprocess` | Reprocessar cálculo que falhou ou ficou pendente. |
| `GET`   | `/health/live`           | Confirmar processo ativo.                         |
| `GET`   | `/health/ready`          | Confirmar dependências necessárias disponíveis.   |

Contratos detalhados de request, response e erros estão definidos em [`docs/03-contratos-http.md`](03-contratos-http.md) e serão implementados pelos schemas Zod compartilhados.

## 7. Arquitetura dentro do escopo

### 7.1 Componentes

- Frontend React organizado por feature, começando por `features/tickets`; componentes realmente reutilizáveis ficarão em `frontend/shared`.
- Frontend usa Vite, React Router e CSS organizado por feature.
- TanStack Query para estado remoto e polling; estado local com React; React Hook Form para formulários.
- Zod para schemas de transporte compartilhados e validação em runtime.
- API Node.js com TypeScript.
- Runtime fixado em Node 22 LTS; desenvolvimento usa `tsx` e build usa `tsc`.
- Worker Node.js com TypeScript.
- PostgreSQL.
- Redis e BullMQ.
- BrasilAPI como dependência externa.
- Docker Compose com serviços separados para Frontend, API, Worker, PostgreSQL e Redis.

API e Worker poderão compartilhar pacotes de domínio, aplicação e infraestrutura no mesmo monorepo, mas executarão como processos separados.

O monorepo terá fronteiras de primeiro nível: `frontend/`, `backend/`, `shared/`, `infra/` e `docs/`, usando pnpm Workspaces e `pnpm-lock.yaml` versionado.

### 7.2 Responsabilidades

- Controller HTTP: transporte, autenticação futura e tradução de erros.
- Schemas Zod: validação de transporte em HTTP, jobs e integrações, sem substituir regras de domínio.
- Casos de uso: orquestração das operações.
- Domínio: transições, prioridades, cálculo de SLA e invariantes.
- Repositórios: persistência.
- Driver PostgreSQL: `pg` com pool; cliente HTTP externo: `fetch` com `AbortController`.
- Adapter de feriados: comunicação externa.
- Dispatcher de outbox: publicação confiável de intenções persistidas.
- Produtor e consumidor BullMQ: transporte e execução assíncronos.
- React: interação e representação de estados; nenhuma regra crítica existirá somente no navegador.

### 7.3 Observabilidade mínima

- Logs estruturados.
- `requestId`, `ticketId`, `jobId` e número da tentativa quando aplicável.
- Erros internos registrados sem exposição de stack trace na API.
- Health checks usados pelo Docker Compose.
- Sem dashboard de métricas nesta entrega.

### 7.4 Segurança mínima

- Validação de todos os dados de entrada.
- Limite de tamanho do corpo HTTP.
- CORS restrito ao Frontend configurado.
- Headers HTTP seguros.
- Rate limiting básico configurável na API.
- Segredos e URLs somente por variáveis de ambiente.
- Nenhum segredo versionado.
- Mensagens externas sem stack trace, SQL ou conteúdo sensível.
- Dependências avaliadas antes da entrega.
- Controles, evidências e riscos residuais estão definidos em [`docs/02-seguranca-owasp.md`](02-seguranca-owasp.md).

Autenticação e autorização não serão implementadas. Essa limitação deverá aparecer no README e impede afirmar que o histórico identifica usuários reais.

## 8. Fora do escopo

- Kafka ou outra plataforma de event streaming.
- Microservices independentes.
- Kubernetes ou cloud deployment.
- Autenticação, autorização, perfis e recuperação de senha.
- Multiempresa ou multitenancy.
- Clientes, contratos ou cadastro separado de solicitantes.
- Comentários, anexos, tags e atribuição de responsáveis.
- Notificações por e-mail, SMS ou push.
- Escalonamento automático.
- Pausa de SLA e calendários por cliente.
- Feriados estaduais ou municipais.
- Dashboard analítico.
- WebSocket ou Server-Sent Events.
- Event sourcing ou CQRS.
- Exclusão de tickets ou histórico.
- Importação e exportação.
- Internacionalização da interface.
- Aplicativo mobile.
- Cobertura de testes como meta percentual isolada.
- Otimizações para um milhão de acessos nesta versão.

## 9. Riscos e trade-offs assumidos

### 9.1 Persistência e publicação na fila

PostgreSQL e Redis não compartilham transação. A solução usará Transactional Outbox: Ticket, histórico, idempotência e intenção de publicação serão persistidos na mesma transação PostgreSQL. Dispatcher publicará no BullMQ depois do commit.

Se Redis estiver indisponível, o registro outbox permanecerá pendente. Se o processo cair depois da publicação e antes da confirmação, o mesmo job poderá ser publicado novamente; `jobId` determinístico e Worker idempotente impedirão efeitos duplicados.

O Dispatcher usará estados `pending`, `processing` e `published`, com `locked_until` para lease recuperável. O padrão será polling de 1 segundo, lote de 10 registros e lease de 30 segundos, todos configuráveis.

Trade-offs:

- Mais uma tabela e rotina de dispatcher.
- Mais testes de recuperação.
- Garantia de não perder intenção de processamento após commit.
- PostgreSQL continua fonte de verdade; Redis continua transporte.

### 9.2 Polling

Polling de 3 segundos aumenta leituras, mas reduz complexidade operacional e atende ao requisito de atualização sem F5. Em escala alta, avaliar Server-Sent Events, WebSocket ou eventos entregues por serviço dedicado.

### 9.3 Paginação por página

Simples e adequada ao volume da demonstração. Em tabelas muito grandes e navegação profunda, migrar para cursor baseado em `createdAt` e `id`.

### 9.4 API pública

Serviço externo pode falhar ou limitar requisições. Cache, timeout e retry reduzem impacto, mas cálculo pode terminar como `failed`. O ticket permanece funcional.

## 10. Padrão BDD

### 10.1 Convenções

- Documentação explicativa em português.
- Cenários Gherkin em inglês para manter vocabulário consistente com código e automação.
- Cada cenário descreve comportamento observável, não método ou classe interna.
- Cenários usam linguagem de domínio.
- Relógio, API externa e fila são controláveis nos testes.
- Tags indicam nível principal de validação: `@unit`, `@integration` ou `@e2e`.
- Cenários de erro verificam ausência de efeitos indevidos.
- Um cenário não depende da execução de outro.

### 10.2 Feature: criação de ticket

```gherkin
Feature: Ticket creation
  As a support operator
  I want to create a ticket
  So that a support request can be tracked and processed

  @integration
  Scenario: Create a valid ticket
    Given no ticket exists for idempotency key "create-001"
    When the operator creates a ticket with valid data and idempotency key "create-001"
    Then the API responds with status 201
    And the ticket status is "open"
    And the processing status is "pending"
    And the SLA due date is not defined yet
    And one ticket creation history entry exists
    And one processing job is requested

  @integration
  Scenario Outline: Reject invalid ticket data
    Given no ticket has been created
    When the operator submits a ticket with an invalid <field>
    Then the API responds with status 422
    And the response identifies the invalid field
    And no ticket is persisted
    And no processing job is requested

    Examples:
      | field           |
      | title           |
      | description     |
      | requesterEmail  |
      | priority        |

  @integration
  Scenario: Replay the same creation request
    Given a ticket was created with idempotency key "create-001"
    When the same request is repeated with idempotency key "create-001"
    Then the original ticket is returned
    And no additional ticket is persisted
    And no additional history entry is persisted
    And no additional effective job is created

  @integration
  Scenario: Reject reuse of an idempotency key with different data
    Given a ticket was created with idempotency key "create-001"
    When different ticket data is submitted with idempotency key "create-001"
    Then the API responds with status 409
    And the original ticket remains unchanged
```

### 10.3 Feature: processamento do SLA

```gherkin
Feature: Asynchronous SLA processing
  As a support operator
  I want SLA processing to happen in the background
  So that ticket creation does not depend on external API latency

  @integration
  Scenario: Process SLA successfully
    Given a ticket has processing status "pending"
    And the holiday provider is available
    When the worker processes the ticket job
    Then the processing status becomes "processed"
    And the SLA due date is calculated using business hours
    And the ticket remains available through the API

  @integration
  Scenario: Preserve processing intent when Redis is unavailable
    Given PostgreSQL is available
    And Redis is unavailable
    When the operator creates a valid ticket
    Then the ticket and its outbox record are committed in one transaction
    And the ticket remains with processing status "pending"
    When Redis becomes available again
    And the dispatcher runs
    Then the pending outbox record is published as a processing job
    And the outbox record is marked as published

  @integration
  Scenario: Retry after a transient provider failure
    Given a ticket has processing status "pending"
    And the holiday provider fails transiently on the first attempt
    And the holiday provider succeeds on the second attempt
    When the worker processes the ticket job
    Then two processing attempts are recorded by the queue
    And the processing status becomes "processed"
    And only one SLA result is persisted

  @integration
  Scenario: Mark processing as failed after all retries
    Given a ticket has processing status "pending"
    And the holiday provider remains unavailable
    When all processing attempts are exhausted
    Then the processing status becomes "failed"
    And the SLA due date remains undefined
    And the ticket remains available for consultation
    And the failure can be reprocessed

  @integration
  Scenario: Ignore a duplicated completed job
    Given the current processing version was completed successfully
    When the same job is delivered again
    Then the SLA due date remains unchanged
    And no duplicate business history is created
    And the job completes without duplicate effects

  @integration
  Scenario: Reprocess a failed ticket
    Given a ticket has processing status "failed"
    And the holiday provider is available again
    When the operator requests reprocessing
    Then the processing status becomes "pending"
    And one new processing job is requested
    And the worker can complete the SLA calculation
```

### 10.4 Feature: cálculo em horas úteis

```gherkin
Feature: Business-hour SLA calculation
  As a support operation
  I want SLA dates to respect the agreed calendar
  So that deadlines are calculated consistently

  @unit
  Scenario: Calculate an SLA within the same business day
    Given the ticket was created on a working day at 10:00 in "America/Sao_Paulo"
    And the priority SLA is 4 business hours
    And there are no holidays in the interval
    When the SLA due date is calculated
    Then the SLA due date is the same day at 14:00

  @unit
  Scenario: Continue calculation on the next working day
    Given the ticket was created on a working day at 17:00 in "America/Sao_Paulo"
    And the priority SLA is 4 business hours
    And the next day is a working day
    When the SLA due date is calculated
    Then one business hour is consumed on the creation day
    And the remaining three business hours are consumed on the next day
    And the SLA due date is the next day at 12:00

  @unit
  Scenario: Skip a weekend
    Given the ticket was created on Friday at 17:00 in "America/Sao_Paulo"
    And the priority SLA is 4 business hours
    And Monday is not a holiday
    When the SLA due date is calculated
    Then the SLA due date is Monday at 12:00

  @unit
  Scenario: Skip a national holiday
    Given the ticket has remaining SLA hours before a national holiday
    When the SLA due date is calculated
    Then no SLA time is consumed during the holiday
    And calculation resumes at 09:00 on the next working day

  @unit
  Scenario: Start before business hours
    Given the ticket was created on a working day at 07:00 in "America/Sao_Paulo"
    When the SLA due date is calculated
    Then SLA consumption starts at 09:00 on the same day

  @unit
  Scenario: Start after business hours
    Given the ticket was created on a working day at 20:00 in "America/Sao_Paulo"
    When the SLA due date is calculated
    Then SLA consumption starts at 09:00 on the next working day
```

### 10.5 Feature: ciclo de vida do ticket

```gherkin
Feature: Ticket lifecycle
  As a support operator
  I want controlled ticket status transitions
  So that ticket state remains consistent

  @integration
  Scenario Outline: Perform an allowed status transition
    Given a ticket has status <currentStatus>
    And the operator knows the current ticket version
    When the operator changes the status to <nextStatus>
    Then the update succeeds
    And the ticket version is incremented
    And one status history entry is persisted

    Examples:
      | currentStatus   | nextStatus    |
      | open            | in_progress   |
      | in_progress     | resolved      |
      | resolved        | in_progress   |
      | resolved        | closed        |

  @integration
  Scenario: Reject an invalid status transition
    Given a ticket has status "open"
    When the operator attempts to change the status to "closed"
    Then the API responds with status 409
    And the ticket remains "open"
    And no status history entry is persisted

  @integration
  Scenario: Treat the current status as a no-op
    Given a ticket has status "in_progress"
    When the operator requests status "in_progress" again
    Then the ticket remains unchanged
    And no status history entry is persisted
```

### 10.6 Feature: prioridade e concorrência

```gherkin
Feature: Ticket priority management
  As a support operator
  I want to change ticket priority safely
  So that SLA reflects current urgency without losing concurrent changes

  @integration
  Scenario: Change priority of an active ticket
    Given an active ticket has priority "medium"
    And the operator knows the current ticket version
    When the operator changes the priority to "high"
    Then the priority becomes "high"
    And the ticket version is incremented
    And one priority history entry is persisted
    And the processing status becomes "pending"
    And one SLA recalculation job is requested

  @integration
  Scenario: Reject priority change on a closed ticket
    Given a ticket has status "closed"
    When the operator attempts to change its priority
    Then the API responds with status 409
    And the priority remains unchanged
    And no priority history entry is persisted

  @integration
  Scenario: Reject an update using a stale version
    Given two clients loaded version 3 of the same ticket
    And the first client successfully updates the ticket to version 4
    When the second client submits an update using version 3
    Then the API responds with status 412
    And the first client change is preserved
    And no history is created for the rejected update
```

### 10.7 Feature: consulta e paginação

```gherkin
Feature: Ticket discovery
  As a support operator
  I want to search and filter tickets
  So that I can find relevant work efficiently

  @integration
  Scenario: Filter tickets by status and priority
    Given tickets with different statuses and priorities exist
    When the operator filters by status "open" and priority "critical"
    Then every returned ticket is "open"
    And every returned ticket is "critical"
    And pagination metadata is returned

  @integration
  Scenario: Search tickets by text
    Given tickets with different titles and descriptions exist
    When the operator searches for a known text fragment
    Then matching tickets are returned
    And non-matching tickets are not returned

  @integration
  Scenario: Limit page size
    Given more than 100 tickets exist
    When the operator requests a page size greater than 100
    Then the API applies the documented validation rule
    And no response contains more than 100 tickets

  @integration
  Scenario: Return an empty result
    Given no ticket matches the selected filters
    When the operator requests the ticket list
    Then the API responds successfully
    And the returned ticket collection is empty
```

### 10.8 Feature: atualização assíncrona da interface

```gherkin
Feature: Asynchronous processing feedback
  As a support operator
  I want processing changes to appear automatically
  So that I do not need to refresh the page

  @e2e
  Scenario: Display successful processing without a page reload
    Given a newly created ticket is visible as "pending"
    And the worker completes its job
    When the next polling interval occurs
    Then the same ticket is displayed as "processed"
    And its SLA due date is displayed
    And the browser page was not reloaded

  @e2e
  Scenario: Display a definitive processing failure
    Given a visible ticket is being processed
    When all worker retries are exhausted
    Then the ticket is displayed as "failed"
    And a reprocess action is available
    And no internal error details are shown

  @integration
  Scenario: Display a concurrent update conflict
    Given the operator is viewing an outdated ticket version
    When the operator submits a status or priority update
    Then the interface explains that the ticket changed
    And the current ticket data is reloaded
    And the operator change is not silently overwritten
```

### 10.9 Feature: execução local

```gherkin
Feature: Reproducible local execution
  As a technical evaluator
  I want to start the complete solution with one command
  So that I can evaluate behavior without manual environment setup

  @e2e
  Scenario: Start the complete stack
    Given Docker and Docker Compose are available
    And the documented environment file was created from the example
    When the evaluator runs "docker compose up --build"
    Then the database becomes healthy
    And Redis becomes healthy
    And the API becomes ready
    And the worker starts consuming jobs
    And the frontend becomes accessible

  @e2e
  Scenario: Reject requests while required dependencies are unavailable
    Given a required API dependency is unavailable
    When readiness is checked
    Then the API reports that it is not ready
    And liveness still reports whether the API process is running
```

## 11. Estratégia de testes

### 11.1 Testes unitários obrigatórios

Ferramenta: **Vitest**.

- Matriz completa de transições de status.
- Cálculo de SLA dentro e fora do horário útil.
- Finais de semana e feriados.
- Mudança de prioridade.
- Classificação de erros recuperáveis e definitivos.
- Idempotência do handler do Worker.

### 11.2 Testes de integração obrigatórios

Ferramentas: **Vitest** e `fastify.inject` para as rotas, sem abrir porta TCP.

- Criação e replay por `Idempotency-Key`.
- Validação e ausência de efeitos em entradas inválidas.
- Persistência de histórico.
- Concorrência otimista.
- Filtros e paginação.
- Publicação e consumo do job.
- Retry e estado `failed`, usando provedor externo simulado.
- Reprocessamento.

### 11.3 Testes da interface

Ferramenta: **Playwright** para o caminho crítico da SPA.

- Formulário válido e inválido.
- Exibição de estados `pending`, `processed` e `failed`.
- Atualização por polling sem reload.
- Tratamento de conflito de versão.

### 11.4 Teste ponta a ponta mínimo

Um caminho completo deverá criar ticket pela interface, processá-lo pelo Worker, persistir SLA e exibir `processed` sem reload.

Testes automatizados não chamarão a BrasilAPI real. A integração real será validada por smoke test manual documentado.

## 12. Entregáveis

### 12.1 Código

- Monorepo com Frontend, API, Worker e pacotes compartilhados necessários.
- Migrations versionadas.
- Testes automatizados.
- Dockerfiles e Docker Compose.
- `.env.example` sem segredos.
- Scripts pequenos e previsíveis para desenvolvimento e validação.

### 12.2 Documentação

- README principal.
- Respostas das sete perguntas abertas, com máximo de dez linhas cada.
- Instruções de execução e diagnóstico.
- Estratégia de dados de demonstração, testes e simulação de falhas.
- Plano de escala e estratégia de dados em [`docs/06-estrategia-de-dados-e-escala.md`](06-estrategia-de-dados-e-escala.md).
- Arquitetura e fluxo assíncrono.
- Contratos HTTP e catálogo de erros.
- Matriz OWASP Top 10:2025 com controles e riscos residuais.
- Decisões arquiteturais e trade-offs.
- Estratégia de testes.
- Limitações conhecidas.
- Plano para escala de um milhão de acessos.

### 12.3 Demonstração

Roteiro reproduzível mostrando:

1. Inicialização com Docker Compose.
2. Criação válida.
3. Atualização automática após processamento.
4. Filtro e paginação.
5. Transição válida e transição rejeitada.
6. Histórico.
7. Falha externa, retries e estado final.
8. Reprocessamento bem-sucedido.
9. Execução dos testes.

## 13. Definition of Done

Entrega será considerada pronta quando:

- Todos os serviços subirem com `docker compose up --build`.
- Fluxo principal funcionar sem configuração manual escondida.
- API e Worker executarem em processos separados.
- Criação não esperar a API externa.
- Mudança de processamento aparecer sem F5.
- Entradas inválidas produzirem erros estáveis.
- Retry, falha definitiva e reprocessamento forem demonstráveis.
- Histórico não puder ser alterado pela API.
- Testes críticos passarem de forma determinística.
- Código e logs não contiverem segredos.
- README permitir avaliação por outra pessoa.
- Limitações e decisões forem descritas honestamente.
- Nenhum item declarado fora do escopo for necessário para o fluxo principal.

## 14. Decisões encerradas

As decisões arquiteturais e de contrato foram consolidadas na [`ADR-001`](adr/001-stack-tecnologica-e-arquitetura.md), no [`contrato HTTP`](03-contratos-http.md), na [`matriz OWASP`](02-seguranca-owasp.md) e no [`plano de implementação`](04-checklist-pre-codigo.md). A implementação pode começar; mudanças que alterem fronteiras ou contratos devem gerar nova decisão documentada.

## 15. Critério para aceitar mudanças de escopo

Nova funcionalidade só entra antes da entrega quando:

1. Atende requisito explícito ainda descoberto como ausente.
2. Remove risco material do fluxo principal.
3. Pode ser coberta por critério de aceite e teste.
4. Não ameaça Docker, testes, documentação ou demonstração.

Caso contrário, será registrada como evolução futura.
