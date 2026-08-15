# Evidências de entrega e demonstração

**Status:** Concluído em 2026-08-15

Este roteiro usa somente dados sintéticos e comportamentos implementados. Ele não pressupõe acesso à BrasilAPI nem alteração manual no banco.

## Preparação

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
HOLIDAY_PROVIDER_MODE=success docker compose --env-file .env up --build --wait
```

Abra `http://localhost:5173` e mantenha o terminal do Compose disponível para observar os serviços.

## Roteiro de sucesso

1. Abra **Novo ticket** e crie um Ticket de prioridade **Alta**.
2. No detalhe, observe primeiro `Aguardando cálculo` ou `Em processamento` e depois `Processado`, sem atualizar a página.
3. Confira o prazo de SLA exibido em `America/Sao_Paulo`.
4. Troque o atendimento para **Em andamento**; o histórico deve mostrar `Atendimento: Aberto → Em andamento`.
5. Altere a prioridade; a API cria uma nova intenção de cálculo e o processamento volta a um estado observável.

## Idempotência

O formulário cria uma chave por tentativa lógica. Para demonstrar o contrato HTTP diretamente, repita o comando abaixo com o mesmo corpo:

```bash
curl --request POST http://localhost:3000/tickets \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: 5a6a398f-b34d-4be3-8b2d-6e579a3c36f9' \
  --data '{"title":"Demonstração idempotente","description":"Corpo sintético para demonstrar a repetição segura.","requesterEmail":"operador-demo@example.test","priority":"high"}'
```

Na segunda chamada, o mesmo Ticket é retornado e nenhum novo histórico ou Outbox é criado. Se a chave for repetida com corpo diferente, a resposta é `409` com `idempotency.key_reused`.

## Retry, falha e reprocessamento

1. Pare os serviços: `docker compose down`.
2. Inicie com falha definitiva: `HOLIDAY_PROVIDER_MODE=400 docker compose --env-file .env up --build --wait`.
3. Crie um Ticket. O Worker o marca como `Falhou`, sem retry infinito.
4. Recrie somente o Worker em sucesso:

   ```bash
   HOLIDAY_PROVIDER_MODE=success docker compose --env-file .env up --force-recreate --no-deps -d worker
   ```

5. No detalhe do Ticket falho, use **Reprocessar SLA** e observe `Processado`.

Para demonstrar retry transitório, substitua `400` por `timeout`, `429` ou `500`; as tentativas e o backoff seguem `SLA_RETRY_ATTEMPTS` e `SLA_RETRY_BACKOFF_MS`.

## Verificações automatizadas

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --dir backend test
corepack pnpm --dir frontend test
corepack pnpm --dir shared test
corepack pnpm test:e2e
```

O E2E cria um Compose temporário (`inbot-e2e`) com PostgreSQL, Redis, migrations, API, Worker e frontend. Ele usa portas 3100 e 5174, aguarda health checks e remove seus containers e volumes ao terminar.

## Segurança e auditoria de dependências

Em 2026-08-15, a revisão estática percorreu API Fastify, repositórios Drizzle, Worker, frontend React, Compose, Dockerfiles, variáveis e arquivos ignorados. Foram confirmados os seguintes controles:

- Entradas HTTP são validadas com Zod; consultas usam Drizzle e valores parametrizados.
- React não usa HTML não confiável; o frontend codifica o identificador de Ticket na URL.
- CORS usa uma origem configurada e permite explicitamente somente `GET`, `HEAD`, `POST` e `PATCH`.
- Helmet, limite de corpo, rate limit, Problem Details seguro, `ETag`/`If-Match` e redaction de e-mail/descrição/cookies/autorização estão ativos na API.
- Jobs transportam apenas `ticketId` e versão, sem e-mail ou descrição.
- `.env` é ignorado; o `.env.example` contém apenas credenciais locais declaradas para desenvolvimento.

Após atualizar Fastify, Drizzle ORM e Vite, a verificação abaixo retornou `No known vulnerabilities found` para dependências de produção:

```bash
corepack pnpm audit --prod
```

Isso não substitui SCA contínuo, DAST, TLS de produção, WAF, alerting centralizado ou gestão de segredos em cloud. Autenticação e autorização continuam deliberadamente fora do escopo; portanto, as rotas não devem ser expostas publicamente.
