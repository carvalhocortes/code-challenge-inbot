# Fronteiras do adaptador HTTP

## Objetivo

Separar o registro das rotas HTTP da adaptação de requests e responses, para que
o router apenas conecte método/URL ao controller e o controller traduza HTTP
para os casos de uso da aplicação.

## Situação atual

Os módulos `backend/src/api/routes/tickets.ts` e
`backend/src/api/routes/health.ts` registram as rotas Fastify e também executam
validação de entrada, leitura de headers, chamada dos casos de uso, montagem de
respostas, ETags e Problem Details. Assim, a rota atua simultaneamente como
router e controller.

## Decisão

- `api/routes` será responsável somente por registrar método, caminho e delegação
  ao controller.
- `api/controllers` será o adapter HTTP: valida payload/query/params/headers,
  chama `application`, traduz resultados para responses e define headers/status
  HTTP.
- `application` continuará sem dependência de Fastify, HTTP ou infraestrutura.
- `api/dependencies.ts` continuará como composition root da API, selecionando os
  adapters de infraestrutura e entregando os casos de uso aos controllers.
- O tratamento global de exceções continuará no adapter HTTP compartilhado em
  `api/http/problem-details.ts`.

## Escopo desta refatoração

- Extrair `TicketController` e `HealthController`.
- Reduzir `routes/tickets.ts` e `routes/health.ts` a wiring de endpoints.
- Preservar contratos, status, headers e payloads HTTP existentes.
- Adicionar cobertura estrutural que impeça rotas de receberem lógica de
  aplicação diretamente no futuro.

## Fora de escopo

- Alterar regras do domínio Ticket/SLA.
- Dividir o monólito em serviços.
- Alterar regras do domínio, schema ou migrações; a fachada
  `PostgresTicketRepository` permanece somente como compatibilidade interna.
- Introduzir um framework adicional de controllers ou um container de DI.

## Critérios de aceite

1. Cada endpoint existente continua respondendo com o mesmo contrato observável.
2. Os routers não importam schemas, casos de uso, mapeadores de response ou
   helpers de Problem Details.
3. Controllers dependem apenas de contratos da aplicação e adapters HTTP; não
   dependem diretamente de infraestrutura.
4. Typecheck, testes do backend e verificação de formatação passam.

## Riscos e mitigação

O risco principal é alterar detalhes HTTP durante a movimentação do código,
especialmente ETag, `If-Match`, idempotência e serialização de datas. A
mitigação é manter os testes de API como testes de contrato e extrair a lógica
sem mudar os valores observáveis.
