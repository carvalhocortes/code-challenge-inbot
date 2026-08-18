# Refatoração Clean Code — P1 a P3

## Objetivo

Reduzir o acoplamento e a carga cognitiva do backend sem alterar os contratos
HTTP, as regras funcionais do Ticket, o schema PostgreSQL ou o fluxo Outbox/SLA.

## Escopo

- P1: retirar `@inbot/shared` de `domain` e `application`; criar DTOs internos
  para casos de uso; mover a geração de ID para a aplicação; substituir a
  composição do repositório único por portas de comandos e consultas.
- P2: separar o adapter PostgreSQL em implementações de comandos e consultas;
  extrair parsing/presentação repetidos dos controllers; injetar relógio no
  adapter HTTP; fortalecer os testes de fronteira.
- P3: separar BrasilAPI, Fake e cache em providers de infraestrutura distintos,
  mantendo um barrel compatível para os imports existentes.

Os adapters concretos agora são `PostgresTicketCommandRepository` e
`PostgresTicketQueryRepository`. `PostgresTicketRepository` permanece apenas
como fachada de compatibilidade para consumidores internos e fixtures de
integração; a composição da API usa diretamente os dois adapters focados.

## Decisões

- `@inbot/shared` continua sendo contrato de transporte/integração. A API pode
  validá-lo, mas domínio e aplicação não dependem dele.
- A aplicação gera o ID do Ticket porque isso é decisão do caso de uso, não do
  transporte HTTP.
- O adapter PostgreSQL mantém a fronteira transacional. A divisão é por
  responsabilidade (comandos versus consultas), não por um arquivo para cada
  método.
- A lógica de domínio continua no domínio. A infraestrutura persiste decisões
  e efeitos atômicos, sem criar regras HTTP ou de negócio novas.
- A validação runtime do payload BullMQ permanece no adapter da fila; o serviço
  de aplicação recebe um job interno já tipado.

## Critérios de aceite

1. `domain` e `application` não importam `@inbot/shared`, Fastify, Drizzle,
   BullMQ, Redis, PostgreSQL ou módulos de entrada.
2. O controller não gera ID nem chama `new Date()` diretamente.
3. A API mantém os mesmos status, headers e payloads observáveis.
4. O repository de comandos não contém consultas de listagem/detalhe e o
   repository de consultas não grava Ticket, histórico ou Outbox.
5. BrasilAPI, Fake e cache têm módulos separados e continuam implementando o
   mesmo port `HolidayProvider`.
6. Typecheck, testes focados, formatação e verificações de fronteira passam.

## Fora de escopo

- Alterar regras de transição, SLA, idempotência ou concorrência.
- Alterar schema/migrations ou introduzir um container de DI.
- Dividir o monólito em serviços.
- Reescrever todos os testes HTTP em uma única etapa; a divisão de arquivos de
  teste fica limitada ao que melhora a cobertura da refatoração.

## Riscos

O maior risco é uma mudança acidental nos contratos de criação, ETag, histórico
ou Outbox durante a extração. Os testes de API e integração existentes serão
mantidos como evidência de comportamento, e cada grupo de arquivos será
validado antes de ser consolidado em commit atômico.
