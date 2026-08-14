# ADR-001 - Stack tecnológica e arquitetura da solução

**Status:** Aceita

**Data:** 2026-08-14

## Contexto

O desafio exige uma solução Full Stack executável por Docker Compose, com:

- Back-end em Node.js.
- Front-end em React.
- API HTTP e Worker executando separadamente.
- Persistência local.
- Processamento assíncrono por fila.
- Integração com API pública.
- Atualização da interface sem F5.

O escopo funcional e os cenários BDD estão definidos em [`docs/01-escopo-entrega-e-bdd.md`](../01-escopo-entrega-e-bdd.md). Esta ADR decidirá tecnologias e limites arquiteturais usados para implementá-los.

PostgreSQL, Redis e BullMQ apareceram no README e no documento de escopo como planejamento inicial. As decisões D1 a D12 foram discutidas, registradas e aceitas nesta ADR.

## Problema

Precisamos escolher uma solução que:

- Caiba em 12 a 18 horas úteis de trabalho.
- Seja simples de executar e avaliar.
- Preserve regras de domínio testáveis.
- Isole HTTP, banco, fila e API externa.
- Evite duplicação entre API e Worker.
- Permita explicar decisões e trade-offs em entrevista.
- Não use patterns ou infraestrutura sem problema concreto.

## Restrições confirmadas

| Restrição                          | Origem       | Estado     |
| ---------------------------------- | ------------ | ---------- |
| Node.js no back-end                | Enunciado    | Confirmada |
| React no front-end                 | Enunciado    | Confirmada |
| API e Worker separados em execução | Enunciado    | Confirmada |
| Fila com retry                     | Enunciado    | Confirmada |
| Banco persistente local            | Enunciado    | Confirmada |
| Docker Compose com um comando      | Enunciado    | Confirmada |
| TypeScript                         | Planejamento | Aceita     |
| PostgreSQL                         | D3           | Aceita     |
| Redis com BullMQ                   | D5           | Aceita     |

## Direcionadores da decisão

Ordem de prioridade:

1. Correção dos fluxos críticos.
2. Capacidade de teste.
3. Clareza das fronteiras.
4. Velocidade de entrega.
5. Operação local previsível.
6. Familiaridade e capacidade de defesa na entrevista.
7. Evolução futura sem antecipar escala inexistente.
8. Performance compatível com a demonstração.

## Decisões necessárias

| ID  | Tema                                                   | Estado   |
| --- | ------------------------------------------------------ | -------- |
| D1  | Organização e arquitetura do back-end                  | Aceita   |
| D2  | Framework HTTP e injeção de dependências               | Aceita   |
| D3  | Banco de dados                                         | Aceita   |
| D4  | Biblioteca de persistência e migrations                | Aceita   |
| D5  | Mensageria e implementação de retry                    | Aceita   |
| D6  | Estratégia de consistência entre banco e fila          | Aceita   |
| D7  | Organização e arquitetura do front-end                 | Aceita   |
| D8  | Estado remoto, estado local e formulários no front-end | Aceita   |
| D9  | Contratos e validação compartilhada                    | Aceita   |
| D10 | Estratégia e ferramentas de teste                      | Aceita   |
| D11 | Organização do monorepo e package manager              | Aceita   |
| D12 | Linguagem e disciplina de tipagem                       | Aceita   |

Uma decisão só muda para **Aceita** depois de responder sua pergunta crítica e registrar consequências.

## D1 - Organização e arquitetura do back-end

### Opção A - Monólito modular com API e Worker como entradas separadas

Um repositório e uma base de código, com dois processos executáveis. Regras de domínio e casos de uso são compartilhados; controllers, consumidores de fila e adapters permanecem nas bordas.

Estrutura conceitual:

```text
apps/
  api/
  worker/
packages/
  domain/
  application/
  infrastructure/
  contracts/
```

Vantagens:

- Evita duplicação de regras.
- Facilita testes unitários sem infraestrutura.
- Mantém API e Worker separados como pedido.
- Permite trocar banco, fila ou API externa por adapters.
- Cabe no prazo quando as fronteiras permanecem pequenas.

Custos e riscos:

- Pode virar arquitetura cerimonial se cada operação ganhar camadas vazias.
- Compartilhamento incorreto pode acoplar domínio a framework.
- Exige regra clara de dependências entre módulos.

### Opção B - Aplicações independentes com pacote de contratos compartilhado

API e Worker possuem casos de uso e infraestrutura próprios. Compartilham somente mensagens e tipos de contrato.

Vantagens:

- Fronteira operacional explícita.
- Menor acoplamento de implementação.
- Caminho mais direto para deploys independentes.

Custos e riscos:

- Duplica acesso a tickets, erros e parte da orquestração.
- Aumenta configuração, testes e manutenção.
- Benefício operacional pequeno para esta entrega local.

### Opção C - MVC único com Worker dentro da estrutura do framework

Controllers, services, repositories e processors organizados conforme convenção do framework.

Vantagens:

- Implementação rápida.
- Estrutura conhecida por muitos times Node.js.
- Menos decisões iniciais.

Custos e riscos:

- Regras podem ficar concentradas em services dependentes do framework.
- Testes tendem a exigir mais infraestrutura.
- Limites entre domínio, aplicação e adapters ficam menos evidentes.

### Decisão

**Opção A - Monólito modular com API e Worker como entradas separadas.**

API e Worker compartilharão regras de domínio e casos de uso dentro do monorepo. Continuarão como processos e entradas independentes. A decisão mantém somente quatro fronteiras úteis:

1. Domínio: regras puras.
2. Aplicação: casos de uso e portas.
3. Infraestrutura: PostgreSQL, BullMQ e BrasilAPI.
4. Entradas: HTTP e consumidor do Worker.

Não serão criados aggregates, factories, buses ou abstrações sem uso concreto.

### Consequências

- Regra de negócio terá uma única implementação compartilhada.
- API HTTP não consumirá código do Worker, nem Worker consumirá controllers HTTP.
- Domínio e aplicação não dependerão de framework HTTP, banco, BullMQ ou BrasilAPI.
- Adapters poderão ser compartilhados somente quando implementarem portas comuns.
- API e Worker terão inicialização, configuração e containers próprios.
- Separação em microservices exigirá nova decisão e evidência operacional; não será antecipada.

## D2 - Framework HTTP e injeção de dependências

### NestJS

NestJS é um framework de aplicação Node.js que organiza o sistema com Modules, Controllers e Providers. Seu container resolve dependências e permite substituir providers em testes. A documentação também oferece integração com o ciclo de testes e override de dependências. [NestJS Modules](https://docs.nestjs.com/modules) · [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

No nosso desenho, um módulo de Tickets pode compor controllers, casos de uso e adapters sem colocar regra de domínio dentro do controller. API e Worker podem inicializar entradas diferentes sobre os mesmos módulos de aplicação.

Custos:

- Decorators e ciclo de vida precisam ser aprendidos.
- A convenção pode esconder dependências se módulos forem exportados sem critério.
- Criar classes e módulos vazios seria complexidade sem benefício.

### Fastify

Fastify é um framework HTTP mais fino, baseado em rotas, plugins, hooks, decorators e validação/serialização. Seu modelo de plugins fornece encapsulamento, mas a composição de casos de uso e injeção de dependências fica sob responsabilidade da aplicação. [Fastify Reference](https://fastify.dev/docs/latest/Reference/) · [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)

No nosso desenho, seria necessário criar explicitamente a composição das portas, adapters, controllers e inicializações da API e do Worker.

Custos:

- Mais liberdade significa mais decisões de estrutura.
- DI e substituição de adapters em testes precisariam de composição manual ou biblioteca adicional.
- É fácil deixar a organização consistente apenas por convenção da equipe.

### Comparação para este projeto

| Critério | NestJS | Fastify |
| --- | --- | --- |
| Estrutura modular | Convenção e container prontos | Plugins e composição própria |
| DI | Nativa | Manual ou biblioteca adicional |
| HTTP | Abstraído por controllers e adapters | Explícito em rotas e hooks |
| Testes de dependências | Utilities e overrides integrados | Injeção depende do desenho da aplicação |
| Velocidade inicial | Menos código de infraestrutura, mais conceitos do framework | Poucos conceitos, mais composição manual |
| Risco no nosso prazo | Boilerplate excessivo | Arquitetura inconsistente |

### Decisão

**Fastify direto, sem NestJS.** A aplicação terá composição manual explícita das portas, adapters, casos de uso e entradas HTTP/Worker. Fastify será usado como framework HTTP, não como container de domínio.

### Consequências

- A composição das dependências ficará em factories/bootstrap da API e do Worker.
- Rotas Fastify serão adapters de entrada e não conterão regras de negócio.
- Domínio e aplicação continuarão sem imports de Fastify.
- Testes poderão montar casos de uso com fakes explícitos, sem container global.
- Plugins Fastify serão usados para infraestrutura HTTP, validação, logging e health checks.
- A estrutura de módulos será uma convenção documentada do monorepo, não imposta por decorators.
- NestJS não será adicionado como camada intermediária ou dependência indireta.
- Se a composição manual crescer sem clareza, isso será evidência para revisar a decisão, não motivo para adicionar abstrações preventivamente.


## D3 - Banco de dados: PostgreSQL ou MongoDB

### Invariantes que a persistência precisa proteger

Esta escolha será baseada no comportamento exigido, não na preferência genérica entre SQL e NoSQL:

- Criar Ticket, chave de idempotência e Histórico do Ticket sem estado parcial.
- Atualizar Status de atendimento ou Prioridade junto com seu histórico.
- Garantir unicidade da chave idempotente.
- Detectar concorrência otimista pela versão do Ticket.
- Consultar e paginar por status, prioridade, texto e data.
- Manter Histórico do Ticket com crescimento independente.
- Permitir Transactional Outbox na mesma transação PostgreSQL, sem transação distribuída com Redis.

### Opção A - PostgreSQL

Modelagem prevista em tabelas relacionadas, inicialmente `tickets`, `ticket_history`, `idempotency_keys` e `outbox_messages`.

Vantagens:

- Transações abrangem as múltiplas linhas envolvidas em cada comando.
- `PRIMARY KEY`, `UNIQUE`, `CHECK` e `FOREIGN KEY` expressam invariantes também no banco.
- Histórico cresce separado do Ticket sem aumentar indefinidamente um único registro.
- Filtros, ordenação estável, paginação e consultas futuras encaixam naturalmente no modelo.
- Concorrência otimista pode usar atualização condicionada por `id` e `version`.
- Uma eventual tabela de outbox pode participar da mesma transação do Ticket.
- `jsonb` continua disponível caso algum metadado externo realmente precise de formato flexível.

Custos e riscos:

- Exige migrations disciplinadas.
- Mudanças estruturais precisam ser planejadas.
- Uso incorreto de ORM pode esconder consultas ruins ou produzir carregamento excessivo.

### Opção B - MongoDB

O Ticket poderia ser um documento contendo parte dos seus dados relacionados.

Vantagens:

- Estrutura documental simples quando todo agregado é lido e escrito junto.
- Atomicidade de escrita dentro de um único documento.
- Índices únicos e filtros condicionais também atendem idempotência e concorrência otimista.
- Schema flexível favorece Tickets com formatos muito diferentes entre categorias.

Custos e riscos neste projeto:

- Histórico embutido é uma coleção de crescimento contínuo e aumenta indefinidamente o documento.
- Separar histórico e idempotência em coleções reduz a vantagem da atomicidade por documento.
- MongoDB suporta transações entre documentos, mas adicioná-las aqui aproxima a solução do modelo transacional que PostgreSQL já representa naturalmente.
- Flexibilidade de schema traz pouco benefício porque campos e regras do Ticket já estão definidos e validados.
- Não existe requisito de escala, distribuição ou formato variável que compense nova decisão operacional.

### O que não decide a escolha

- MongoDB não é descartado por ausência de transações; ele possui transações multidocumento.
- MongoDB não é descartado por idempotência; índices únicos existem nas duas opções.
- PostgreSQL não é escolhido porque SQL é sempre superior.
- Performance abstrata não decide sem carga, volume e padrão de acesso medidos.

### Quando MongoDB seria preferível

MongoDB ganharia força se Tickets fossem documentos autocontidos, com estruturas muito diferentes por categoria, leitura predominante do agregado completo, histórico limitado ou armazenado fora do documento e necessidade comprovada de distribuição horizontal.

Essas condições não existem no escopo atual.

### Decisão

**Opção A - PostgreSQL.** As partes difíceis deste projeto são consistência entre registros, histórico crescente, unicidade, concorrência e consultas estruturadas. PostgreSQL oferece a menor distância entre regras documentadas e garantias de persistência.

### Consequências

- O modelo inicial usará tabelas relacionadas para `tickets`, `ticket_history`, `idempotency_keys` e `outbox_messages`.
- Migrations serão obrigatórias e versionadas.
- Transações serão usadas quando uma operação alterar Ticket e histórico juntos.
- Constraints do banco complementarão validações da aplicação.
- Índices serão criados a partir dos filtros e ordenação efetivamente usados.
- `jsonb` só será usado para metadado variável com necessidade demonstrada.
- MongoDB fica registrado como alternativa rejeitada para este escopo, não como tecnologia inadequada em geral.

### Evidências técnicas

- [PostgreSQL - Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [PostgreSQL - Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL - JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)
- [MongoDB - Atomicity and Transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
- [MongoDB - Embedded Data](https://www.mongodb.com/docs/manual/data-modeling/embedding/)
- [MongoDB - Unbounded Arrays](https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/unbounded-arrays/)
- [MongoDB - Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/)

## D4 - Biblioteca de persistência e migrations

### Opções consideradas

- **SQL direto com `pg`**: máxima visibilidade da consulta, mas exige repetir tipagem, mapeamento e composição de migrations manualmente.
- **Prisma**: abstração e client gerado fortes, porém adiciona uma linguagem de schema e distancia parte das consultas do SQL que decidimos manter explícito.
- **Drizzle**: camada TypeScript tipada e SQL-like, com schema em código e `drizzle-kit` para gerar e aplicar migrations.

Drizzle documenta tanto consultas SQL-like quanto uma API relacional opcional, mantendo a possibilidade de escolher o nível de abstração por consulta. [Drizzle Overview](https://orm.drizzle.team/docs/overview) · [Drizzle Queries](https://orm.drizzle.team/docs/data-querying)

### Decisão

**Drizzle ORM com PostgreSQL.** O schema será definido em TypeScript, as migrations SQL serão geradas e versionadas, e a aplicação usará a API SQL-like como padrão. `drizzle-kit migrate` será o caminho de aplicação das migrations em ambientes executáveis. [Drizzle Migrations](https://orm.drizzle.team/docs/migrations) · [Drizzle Kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)

### Consequências

- Consultas, joins, filtros e índices permanecerão legíveis para quem conhece SQL.
- Tipos inferidos reduzirão divergência entre schema, query e resposta interna.
- Migrations serão artefatos versionados, revisáveis e executáveis no Docker.
- Repositórios serão a única camada autorizada a importar Drizzle.
- Domínio e casos de uso dependerão de portas, não de tabelas ou tipos Drizzle.
- `drizzle-kit push` não será usado como fluxo principal, pois não deixa a mesma trilha de migration versionada.
- A equipe ainda precisará entender SQL, índices e transações; Drizzle não substitui conhecimento do banco.

## D5 - Mensageria e implementação de retry

### Opções consideradas

- **BullMQ + Redis**: fila de jobs orientada ao ecossistema Node.js, com Worker separado, estados de job e retry configurável.
- **RabbitMQ**: broker de mensagens robusto e válido, mas adiciona modelo operacional e configuração que não são necessários para uma única fila de processamento nesta entrega.
- **Kafka**: plataforma de streaming e retenção de eventos, adequada a outros padrões de escala e consumo, mas desproporcional para jobs de SLA com um Worker.

BullMQ implementa filas sobre Redis e expõe ciclo de vida de jobs, Worker e retry com backoff. [BullMQ Architecture](https://docs.bullmq.io/guide/architecture) · [BullMQ Workers](https://docs.bullmq.io/guide/workers) · [BullMQ Retries](https://docs.bullmq.io/guide/retrying-failing-jobs)

### Decisão

**BullMQ + Redis.** A API será produtora de jobs; o Worker será consumidor em processo separado. Redis será serviço próprio do Docker Compose.

### Regras de processamento

- Job terá identificador determinístico por Ticket e versão de processamento.
- Worker será idempotente e poderá receber o mesmo job mais de uma vez.
- Falhas transitórias usarão até três tentativas e backoff exponencial configurável.
- Falhas definitivas serão movidas para estado `failed` e ficarão reprocessáveis.
- Erros não recuperáveis não devem consumir tentativas desnecessárias.
- API, Worker e adapters registrarão `jobId`, `ticketId` e tentativa nos logs.
- Configuração de conexão e política de retenção ficará em variáveis de ambiente.
- Persistência da fila e política Redis para produção serão documentadas; desenvolvimento local prioriza reprodução simples.

### Consequências

- Atendemos diretamente ao requisito de processamento assíncrono e retry.
- API não aguardará cálculo de SLA nem chamada à API pública.
- Worker terá ciclo de vida, health check e encerramento próprios.
- Não usaremos Kafka, RabbitMQ ou outro broker nesta entrega.
- A decisão de mensageria não resolve atomicidade entre PostgreSQL e Redis; D6 define essa garantia por meio de outbox.
- A fila não será usada como banco de domínio; PostgreSQL continua fonte de verdade do Ticket.

## D6 - Consistência entre PostgreSQL e BullMQ

### Opções consideradas

- **Publicação direta após o commit**: simples, mas uma queda entre o commit do Ticket e o `queue.add` pode deixar o Ticket pendente sem job.
- **Transactional Outbox**: persiste intenção de publicação na mesma transação do Ticket; um dispatcher publica e confirma a intenção separadamente.
- **Transação distribuída entre PostgreSQL e Redis**: não será adotada; aumenta acoplamento e complexidade operacional sem benefício proporcional.

### Decisão

**Transactional Outbox.** A transação PostgreSQL de criação ou alteração relevante persistirá Ticket, Histórico do Ticket, idempotência e registro outbox. Um dispatcher dentro do processo Worker buscará registros pendentes, publicará jobs no BullMQ e marcará os registros como publicados.

### Fluxo garantido

1. API abre transação PostgreSQL.
2. API grava Ticket, histórico, idempotência e outbox.
3. API confirma a transação.
4. API responde sem aguardar o Worker ou a API externa.
5. Dispatcher lê outbox pendente.
6. Dispatcher publica job com `jobId` determinístico.
7. Dispatcher marca outbox como publicado.
8. Se Redis falhar, outbox permanece pendente e será tentado novamente.

### Consequências

- Ticket não fica sem intenção persistida de processamento após commit bem-sucedido.
- Pode haver publicação duplicada se Redis aceitar o job e o processo cair antes de marcar outbox como publicado; Worker idempotente é obrigatório.
- Outbox exige status, tentativas, timestamps e política de retenção.
- Dispatcher usará estados `pending`, `processing` e `published`, com `locked_until` para lease recuperável; polling padrão de 1 segundo, lote de 10 e lease de 30 segundos.
- Dispatcher e consumidor de jobs compartilharão o processo Worker, mas terão responsabilidades separadas.
- Testes deverão cobrir falha antes da publicação, falha depois da publicação e reprocessamento.
- A decisão aumenta código, mas demonstra consistência de forma diretamente relacionada ao desafio.

## D7 - Organização e arquitetura do front-end

### Opções consideradas

- **Feature-based**: cada capacidade do produto concentra telas, componentes, hooks e adaptadores específicos da feature.
- **Layer-based**: o código é separado primeiro por tipo técnico (`components`, `hooks`, `services`, `pages`), espalhando uma mesma capacidade por várias pastas.
- **Microfrontends**: cada capacidade seria empacotada e implantada de forma independente; complexidade sem necessidade para este desafio.

### Decisão

**Feature-based.** O front-end React será organizado por capacidade de negócio, começando por `features/tickets`. Cada feature poderá conter seus componentes, telas, hooks e mapeamentos específicos. Elementos realmente reutilizáveis do front-end ficarão em `frontend/shared/ui`, `frontend/shared/lib` ou equivalente. Rotas apenas comporão as features; uma feature não importará detalhes internos de outra.

Esta decisão define a organização do código, mas não antecipa a biblioteca de estado remoto, estado local ou formulários; isso é definido em D8.

### Consequências

- O fluxo de Ticket fica descobrível em uma única fronteira do front-end.
- Componentes compartilhados precisam ser promovidos somente quando houver reutilização real.
- A feature não poderá depender diretamente de detalhes de infraestrutura HTTP; usará um adapter/client definido na própria fronteira do front-end.
- Não haverá microfrontends, design system completo ou abstrações globais sem necessidade demonstrada.

## D8 - Estado remoto, estado local e formulários no front-end

### Opções consideradas

- **TanStack Query para estado remoto, React para estado local e React Hook Form para formulários**: separa problemas diferentes e mantém o escopo pequeno.
- **Uma biblioteca global para todo estado**: mistura cache remoto, estado visual e valores de formulário em uma única solução.
- **Hooks e `fetch` manuais**: reduz dependências, mas repete cache, loading, erro, invalidação e sincronização.

### Decisão

**TanStack Query + estado local do React + React Hook Form.**

- TanStack Query cuidará de queries, mutations, cache, invalidação e polling dos Tickets.
- `useState` e `useReducer` cuidarão de estado efêmero da interface, como filtros abertos, seleção e feedback visual.
- React Hook Form cuidará de valores, validação de formulário, erros e submissão da criação/edição de Ticket.
- Nenhum estado remoto será duplicado em um store global sem uma necessidade demonstrada.

As referências oficiais descrevem TanStack Query com queries, mutations e invalidação, e React Hook Form como biblioteca de gerenciamento/validação de formulários: [TanStack Query](https://tanstack.com/query/latest/docs/framework/react) · [React Hook Form](https://www.react-hook-form.com/).

### Consequências

- O polling exigido pelo desafio fica explícito como responsabilidade de estado remoto, não como `setInterval` espalhado em componentes.
- Mutations invalidarão ou atualizarão as queries relevantes após criação e alteração de Ticket.
- Estado local não será promovido para infraestrutura global por conveniência.
- Formulários terão contrato de entrada separado do modelo retornado pela API; validação de runtime e schemas são definidos em D9.
- A equipe precisa conhecer os estados de carregamento, erro, stale e refetch para testar a interface de forma realista.

## D9 - Contratos e validação compartilhada

### Opções consideradas

- **Zod em um pacote compartilhado de contratos**: define o schema uma vez, valida dados em runtime e infere tipos TypeScript.
- **Somente tipos TypeScript**: evita dependência adicional, mas não protege contra JSON inválido em HTTP, fila ou integração externa.
- **Schemas separados por processo**: permite adaptação local, mas duplica contratos e aumenta o risco de divergência entre SPA, API e Worker.

### Decisão

**Zod como fonte de schemas de transporte, compartilhada entre os processos.** Os schemas representarão requests, responses, query params, erros públicos e payloads de jobs. A API validará entrada HTTP antes de chamar casos de uso; o Worker validará o payload recebido antes de processar; o front-end poderá reutilizar os mesmos schemas para validar formulários e respostas da API quando isso agregar segurança.

O pacote compartilhado fica em `shared`, conforme D11. A validação de transporte não substitui o domínio: regras como transições de status, prioridade e cálculo de SLA continuarão nos casos de uso e entidades. [Documentação oficial do Zod](https://zod.dev/)

### Consequências

- O contrato é executável: além do tipo estático, existe validação contra dados reais.
- Erros de parsing serão convertidos por adapters para o catálogo estável da API, sem expor `ZodError` diretamente ao cliente.
- Schemas de request e response permanecerão separados quando suas responsabilidades forem diferentes.
- Mudanças de contrato exigirão atualizar consumidores e cenários BDD correspondentes.
- Não haverá geração automática de OpenAPI nesta primeira versão; a documentação pública será mantida junto dos contratos enquanto o volume permanecer pequeno.

## D10 - Estratégia e ferramentas de teste

### Opções consideradas

- **Vitest + `fastify.inject` + Playwright**: cobre regras isoladas, HTTP sem abrir porta e o caminho real da SPA com poucas ferramentas.
- **Um único runner para todos os níveis**: reduz comandos, mas mistura necessidades de domínio, servidor e navegador.
- **E2E para todos os cenários**: aproxima-se do usuário, mas torna a suíte lenta, frágil e cara de diagnosticar.

### Decisão

**Vitest para unitários, integração de API por `fastify.inject` e Playwright para E2E.**

- **Unitários (Vitest):** domínio, cálculo de SLA, calendário útil, transições, classificação de erros, idempotência e handlers com dependências falsas.
- **Integração (Vitest + `fastify.inject`):** rotas, schemas Zod, catálogo de erros, idempotência, persistência, outbox, publicação/consumo e retry. O servidor Fastify será criado por factory e testado sem abrir uma porta TCP.
- **E2E (Playwright):** somente o caminho crítico: criar Ticket na SPA, acompanhar polling, aguardar processamento e visualizar `processed`, além de uma validação de erro visível.

Testes automatizados não chamarão a BrasilAPI real; o adapter externo será falso ou controlado nos testes. Um smoke test manual documentará a integração real. Os cenários BDD indicarão o nível esperado com `@unit`, `@integration` ou `@e2e`. [Vitest](https://vitest.dev/guide/) · [Fastify `inject`](https://fastify.dev/docs/latest/Guides/Testing/) · [Playwright Test](https://playwright.dev/docs/intro)

### Consequências

- A maior parte da regra crítica permanece rápida e determinística.
- `fastify.inject` testa o contrato HTTP sem depender de rede ou de uma porta livre.
- Playwright valida a integração visual sem transformar cada detalhe de componente em E2E.
- A suíte precisará de fakes explícitos para fila, feriados e relógio quando o cenário exigir determinismo.
- Não haverá meta percentual de cobertura isolada; prioridade será dada aos invariantes e fluxos BDD críticos.

## D11 - Organização do monorepo e package manager

### Opções consideradas

- **`apps/` e `packages/`**: convenção comum para workspaces, mas esconde a separação de produto e infraestrutura atrás de uma taxonomia genérica.
- **Pastas de fronteira explícita**: separa Frontend, Backend, contratos compartilhados e Infraestrutura no primeiro nível do repositório.
- **Repositórios separados**: facilita ownership independente, mas adiciona coordenação e publicação de contratos antes de existir necessidade real.

### Decisão

O projeto permanecerá em **um único repositório**, com fronteiras explícitas:

```text
frontend/   # SPA React
backend/    # API, Worker, domínio, aplicação e adapters
shared/     # somente contratos Zod e tipos de transporte compartilhados
infra/      # Docker Compose, Dockerfiles, configurações e scripts operacionais
docs/       # escopo, BDD e ADRs
```

Frontend e Backend não importarão detalhes internos um do outro. `shared` não será depósito de regra de negócio: conterá apenas contratos estáveis de transporte. Migrations continuarão próximas da infraestrutura de persistência do Backend; `infra` orquestrará os serviços, não será dona do domínio.

A divisão facilita uma extração futura, mas não a garante sozinha. Para tornar a separação real, imports entre fronteiras, scripts e contratos precisarão ser mantidos explícitos. O workspace será definido por `pnpm-workspace.yaml`, e o lockfile `pnpm-lock.yaml` será versionado.

### Package managers considerados

| Opção | Vantagens | Desvantagens neste desafio |
| --- | --- | --- |
| **npm Workspaces** | Já acompanha o ecossistema Node, menor atrito para o avaliador, `package-lock.json` conhecido e workspaces nativos. | Orquestração de tarefas entre áreas é mais básica; tende a ser menos eficiente em disco e instalação do que pnpm. |
| **pnpm Workspaces** | Instalação rápida, store compartilhado, uso eficiente de disco, workspaces nativos e protocolo `workspace:` explícito. **Escolhido.** | Exige que o ambiente tenha pnpm/Corepack; adiciona uma convenção nova para avaliadores e CI. |
| **Yarn 4 Workspaces** | Workspaces maduros, `workspace:`, constraints, execução paralela e instalação focada. | Configuração e conceitos do Yarn moderno podem aumentar o custo cognitivo; PnP e plugins seriam desnecessários aqui. |
| **Bun** | Runtime, package manager e test runner integrados, com instalação rápida. | Diverge do runtime Node escolhido, pode introduzir diferenças de compatibilidade e aumenta o risco de execução em ambiente do avaliador. |

Referências oficiais: [npm Workspaces](https://docs.npmjs.com/cli/using-npm/workspaces), [pnpm Workspaces](https://pnpm.io/workspaces), [Yarn Workspaces](https://yarnpkg.com/features/workspaces) e [Bun package manager](https://bun.sh/docs/pm/cli).

### Consequências específicas do pnpm

- O README usará `pnpm install`, `pnpm dev`, `pnpm test` e comandos filtrados por workspace quando necessário.
- A versão do pnpm será fixada no `package.json` por `packageManager` e/ou habilitada por Corepack.
- `pnpm-lock.yaml` será obrigatório no versionamento.
- Dependências internas usarão `workspace:` para impedir resolução acidental no registry.

### Consequências

- O avaliador encontra Frontend, Backend e Infraestrutura sem navegar por uma árvore genérica.
- API e Worker continuam processos separados dentro de `backend`.
- Contratos Zod têm um lugar neutro, sem transformar o Backend em dependência de implementação do Frontend.
- Uma futura extração para repositórios ou serviços separados terá menos acoplamento acidental.
- A estrutura exige disciplina contra imports cruzados e contra o crescimento indiscriminado de `shared`.

## D12 - Linguagem e disciplina de tipagem

### Opções consideradas

- **JavaScript sem tipagem estática**: menor configuração inicial, mas reduz a segurança dos contratos entre React, API e Worker.
- **TypeScript sem modo estrito**: mantém tipos opcionais e permite que inconsistências atravessem as fronteiras.
- **TypeScript em modo estrito**: exige contratos explícitos e captura incompatibilidades durante o build.

### Decisão

**TypeScript em todo código próprio, com `strict: true`.** Front-end, API, Worker, domínio, aplicação, adapters e testes serão escritos em TypeScript. Dados externos continuarão sendo tratados como `unknown` até passarem por validação em runtime; TypeScript sozinho não valida JSON recebido por HTTP, filas ou BrasilAPI. A biblioteca e a estratégia de validação compartilhada estão definidas em D9.

### Consequências

- Contratos e refatorações terão feedback do compilador antes da execução.
- Não usaremos `any` como escape padrão; exceções precisarão ser locais e justificadas.
- Será necessário tipar fakes, fixtures, erros e integrações nos testes.
- O build passa a ser uma etapa obrigatória de validação, além dos testes.

## Registro de decisões

| Data       | Decisão         | Resultado   | Justificativa            |
| ---------- | --------------- | ----------- | ------------------------ |
| 2026-08-14 | Node.js e React | Confirmados | Restrições do enunciado. |
| 2026-08-14 | Arquitetura do back-end | Opção A aceita | Compartilhar domínio e casos de uso sem perder separação operacional entre API e Worker. |
| 2026-08-14 | Banco de dados | Opção A aceita | Consistência relacional, histórico separado, constraints, migrations e consultas estruturadas. |
| 2026-08-14 | Framework HTTP e DI | Fastify aceito | Controle explícito do HTTP e composição manual compatível com a preferência do candidato. |
| 2026-08-14 | Persistência e migrations | Drizzle aceito | SQL explícito, tipagem TypeScript e migrations revisáveis sem acoplar domínio ao ORM. |
| 2026-08-14 | Mensageria e retry | BullMQ + Redis aceito | Fila de jobs simples, Worker separado e retry integrado ao ecossistema Node.js. |
| 2026-08-14 | Consistência banco/fila | Transactional Outbox aceito | Evitar Ticket persistido sem intenção de processamento e manter PostgreSQL como fonte de verdade. |
| 2026-08-14 | Arquitetura do front-end | Feature-based aceita | Manter cada capacidade de negócio descobrível sem antecipar microfrontends ou abstrações globais. |
| 2026-08-14 | Estado do front-end | TanStack Query + React + React Hook Form aceitos | Separar estado remoto, estado efêmero e estado de formulário sem store global prematuro. |
| 2026-08-14 | Contratos e validação | Zod aceito | Validar dados em runtime e inferir tipos sem duplicar schemas entre SPA, API e Worker. |
| 2026-08-14 | Estratégia de testes | Vitest + Fastify inject + Playwright aceitos | Separar testes rápidos de domínio, integração HTTP e caminho crítico da interface. |
| 2026-08-14 | Monorepo e package manager | Fronteiras explícitas + pnpm Workspaces aceitos | Separar Frontend, Backend, contratos e Infraestrutura sem adicionar um orquestrador de tarefas. |
| 2026-08-14 | Linguagem e tipagem | TypeScript estrito aceito | Proteger contratos entre front-end, API, Worker e integrações externas. |

## Artefatos derivados do grilling

Os detalhes de implementação e validação estão separados para manter esta ADR como registro de decisões:

- [Escopo e BDD](../01-escopo-entrega-e-bdd.md)
- [Contratos HTTP e catálogo de erros](../03-contratos-http.md)
- [Matriz OWASP Top 10:2025](../02-seguranca-owasp.md)
- [Checklist pré-código](../04-checklist-pre-codigo.md)

Complementos aceitos no grilling: Node 22 LTS com imagem `node:22-bookworm-slim`, Vite, React Router, `pg`, `fetch` com timeout, Pino com redaction, CSS por feature, adapter Zod manual no Fastify, `@hookform/resolvers/zod`, migrations em serviço one-shot, integração com PostgreSQL/Redis reais nos testes e graceful shutdown.

## Glossário arquitetural

| Termo            | Definição neste projeto                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Processo         | Executável independente dentro do Docker Compose, como API ou Worker.                               |
| Módulo           | Fronteira lógica dentro da mesma base de código. Não implica serviço separado.                      |
| Monólito modular | Aplicação única em código e governança, organizada em módulos, podendo iniciar mais de um processo. |
| Porta            | Interface definida pela aplicação para acessar capacidade externa.                                  |
| Adapter          | Implementação concreta de uma porta, como PostgreSQL ou BrasilAPI.                                  |
| Contrato         | Estrutura estável trocada por HTTP ou fila.                                                         |
| Regra de domínio | Comportamento de tickets e SLA independente de framework.                                           |
