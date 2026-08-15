# Gestão de Tickets InBot

Solução do cenário **Gestão de Tickets** da [avaliação técnica](docs/Avaliação%20Senior.pdf).
Permite criar, consultar e conduzir Tickets de suporte enquanto o prazo de SLA é
calculado em segundo plano.

## Entrega

- SPA React para criação, listagem com busca/filtros/paginação e detalhe do Ticket.
- API Fastify com validação, Problem Details, idempotência e concorrência otimista.
- Worker BullMQ que calcula SLA com feriados nacionais da BrasilAPI, retry e cache.
- PostgreSQL como fonte de verdade, com histórico imutável e Transactional Outbox.
- Docker Compose, seed idempotente e testes unitários, de integração e ponta a ponta.

## Executar localmente

Pré-requisitos: Node.js 22, Corepack e Docker Compose.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
docker compose --env-file .env up --build --wait
```

Abra a SPA em `http://localhost:5173`; a API está em `http://localhost:3000`.
Para encerrar, execute `docker compose down`; adicione `--volumes` para descartar
os dados locais.

| Serviço    | Porta | Verificação                              |
| ---------- | ----: | ---------------------------------------- |
| Frontend   |  5173 | `http://localhost:5173`                  |
| API        |  3000 | `GET /health/live` e `GET /health/ready` |
| PostgreSQL |  5432 | `pg_isready`                             |
| Redis      |  6379 | `redis-cli ping`                         |

## Como avaliar comportamentos operacionais

Os cenários abaixo existem para demonstrar falha controlada, recuperação e
garantias de consistência observáveis pelo avaliador.

### Falha de processamento do SLA

O Worker aceita modos determinísticos para o provedor de feriados via
`HOLIDAY_PROVIDER_MODE`.

1. Defina `HOLIDAY_PROVIDER_MODE=400` no arquivo `.env`.
2. Reinicie apenas o Worker:

```bash
docker compose --env-file .env up -d --force-recreate worker
```

3. Crie um Ticket pela SPA ou pela API.
4. Consulte o detalhe do Ticket até `processingStatus` virar `failed`.

Resultado esperado: o Ticket termina com `processingStatus=failed` e `slaDueAt`
permanece `null`.

### Recuperar um Ticket com falha

1. Corrija a causa da falha. Exemplo: volte `HOLIDAY_PROVIDER_MODE=success`.
2. Reinicie o Worker:

```bash
docker compose --env-file .env up -d --force-recreate worker
```

3. Busque o `ETag` atual do Ticket:

```bash
curl -i http://localhost:3000/tickets/<ticket-id>
```

4. Reprocesse com `If-Match`:

```bash
curl -i -X POST \
  http://localhost:3000/tickets/<ticket-id>/reprocess \
  -H 'If-Match: "<versao-atual>"'
```

Resultado esperado: a API responde `202`, devolve novo `ETag` e o Ticket volta
para `pending` até o Worker concluir o SLA.

### Redis indisponível

1. Pare o Redis:

```bash
docker compose stop redis
```

2. Consulte a prontidão da API:

```bash
curl -i http://localhost:3000/health/ready
```

3. Observe os logs do Worker:

```bash
docker compose logs -f worker
```

4. Suba o Redis novamente:

```bash
docker compose start redis
```

Resultado esperado: `/health/ready` retorna `503` enquanto o Redis está fora. A
intenção de processamento continua persistida no PostgreSQL e o Worker retoma a
publicação/processamento quando o Redis volta.

### PostgreSQL indisponível

1. Pare o PostgreSQL:

```bash
docker compose stop postgres
```

2. Consulte a prontidão da API:

```bash
curl -i http://localhost:3000/health/ready
```

3. Observe os logs da API e do Worker:

```bash
docker compose logs -f api
docker compose logs -f worker
```

4. Suba o PostgreSQL novamente:

```bash
docker compose start postgres
```

Resultado esperado: `/health/ready` retorna `503` e operações de leitura,
criação, atualização e processamento deixam de funcionar enquanto o PostgreSQL
está fora, porque ele é a fonte de verdade do sistema.

### Simular idempotência

Repita o mesmo `POST /tickets` com a mesma `Idempotency-Key` e o mesmo corpo:

```bash
curl -i -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-001' \
  -d '{"title":"Falha login","description":"Nao entra","requesterEmail":"a@b.com","priority":"high"}'

curl -i -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-001' \
  -d '{"title":"Falha login","description":"Nao entra","requesterEmail":"a@b.com","priority":"high"}'
```

Resultado esperado: ambas respondem `201`, mas a segunda inclui o header
`Idempotency-Replayed: true`. Se a mesma chave for reutilizada com payload
diferente, a API responde `409`.

### Simular ETag vencida

1. Leia um Ticket e guarde o `ETag`:

```bash
curl -i http://localhost:3000/tickets/<ticket-id>
```

2. Faça uma alteração com esse `ETag`:

```bash
curl -i -X PATCH \
  http://localhost:3000/tickets/<ticket-id>/status \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "1"' \
  -d '{"status":"in_progress"}'
```

3. Reutilize o `If-Match` antigo em outra alteração:

```bash
curl -i -X PATCH \
  http://localhost:3000/tickets/<ticket-id>/priority \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "1"' \
  -d '{"priority":"critical"}'
```

Resultado esperado: a segunda alteração falha com `412` e código
`ticket.version_conflict`, porque a versão local do cliente ficou defasada.

## Edge cases para avaliar

| Caso                                      | Como simular                                                                  | Resultado esperado                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Falha transitória no provedor de feriados | Definir `HOLIDAY_PROVIDER_MODE=500`, `429` ou `timeout` e reiniciar o Worker  | O BullMQ faz retry; se as tentativas acabarem, o Ticket termina em `failed`.                     |
| Publicação repetida do Outbox             | Evidência principal nos testes de integração do Worker                        | Reentrega não deve duplicar efeito de negócio; jobs repetidos podem ser ignorados com segurança. |
| Reprocessar Ticket no estado errado       | Tentar `POST /tickets/{id}/reprocess` depois de o Ticket já estar `processed` | A API responde `409` com código `ticket.reprocess_not_allowed`.                                  |
| Alterar prioridade de Ticket fechado      | Fechar o Ticket e depois tentar mudar a prioridade                            | A API responde `409`, pois a regra de domínio bloqueia a operação.                               |

## Decisões técnicas e trade-offs

- **Monólito modular com dois processos:** API e Worker compartilham domínio,
  mas escalam e falham de forma independente; microserviços seriam custo sem
  benefício proporcional para este escopo.
- **PostgreSQL + Outbox:** Ticket, histórico, chave idempotente e intenção de
  processamento são gravados na mesma transação. Redis é a fila, não a fonte de
  verdade; publicação pode repetir, mas o efeito persistido para a versão atual
  é idempotente.
- **Fastify, Zod e Drizzle:** mantêm o adapter HTTP fino, contratos validados e
  consultas tipadas sem esconder transações ou índices importantes.
- **Polling condicional:** a SPA consulta novamente apenas enquanto há Ticket
  visível pendente ou processando. WebSocket/SSE não são necessários para a demonstração.

## Arquitetura C4

Os detalhes estruturais, os fluxos assíncronos, os invariantes de dados e a
implantação local estão documentados em:

- [Contexto, contêineres e componentes](docs/architecture/c4.md)
- [Fluxos de execução](docs/architecture/runtime-flows.md)
- [Dados e invariantes](docs/architecture/data-and-invariants.md)
- [Implantação e operação local](docs/architecture/deployment.md)

## Qualidade, segurança e limites

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --dir backend test
corepack pnpm --dir frontend test
corepack pnpm --dir shared test
corepack pnpm test:e2e
corepack pnpm audit --prod
```

Entradas HTTP são validadas; erros seguem Problem Details sem detalhes internos;
logs removem e-mail, descrição, cookies e autorização; CORS, Helmet, limite de
corpo e rate limit estão ativos. Esta é uma demonstração local: autenticação,
autorização, TLS de produção, WAF, DAST, alertas centralizados e secret manager
não estão implementados e não devem ser alegados como existentes.

## Se o sistema tivesse um milhão de acessos

Primeiro mediria tráfego, proporção leitura/escrita, p95/p99, backlog, pool de
conexões, uso de PostgreSQL/Redis e SLOs. Depois tornaria API e frontend
stateless atrás de balanceador, adotaria paginação por cursor para consultas
profundas e revisaria índices com `EXPLAIN ANALYZE`. Réplicas de Worker, Redis
HA, retenção de jobs, PgBouncer, réplicas de leitura, cache distribuído e
observabilidade seriam introduzidos somente conforme a evidência de carga.

## Perguntas abertas

### 1. Integração resiliente

Isolo a API externa atrás de uma porta e a consumo em Worker, nunca no caminho
crítico HTTP. Defino timeout, validação de resposta, classificação de falhas,
retry com backoff para timeout/429/5xx e cache com TTL. Persisto a intenção antes
de enfileirar e torno o consumidor idempotente; depois do limite de tentativas,
exponho estado de falha recuperável. Neste projeto, a BrasilAPI segue esse fluxo.

### 2. Refinamento de requisito

Começo por objetivo, ator, resultado mensurável e restrições; em seguida esclareço
exemplos, exceções, dados, segurança, operação e critérios de aceite. Registro
contratos e cenários observáveis antes de código e transformo decisões caras de
reverter em ADRs. Priorizo uma fatia vertical de maior risco, valido cedo e só
então detalho melhorias que não mudam a proposta de valor.

### 3. Idempotência

O cliente envia uma `Idempotency-Key` por tentativa lógica; o servidor persiste
a chave, hash canônico, Ticket e intenção de processamento na mesma transação. A
mesma chave com o mesmo corpo retorna o Ticket original; com corpo diferente,
retorna conflito. Índice único protege concorrência e consumidores usam uma chave
determinística e versão para tolerar reentrega de jobs.

### 4. Síncrono vs. assíncrono

Mantenho síncrono o que valida, autoriza e persiste uma mudança pequena que o
usuário precisa confirmar imediatamente. Uso fila para I/O lento, dependências
instáveis, processamento pesado, retry ou trabalho que pode terminar depois;
respondo com estado observável e UX de acompanhamento. A decisão considera SLA,
consistência, custo de falha, volume, idempotência e experiência do usuário.

### 5. Segurança

Em uma API pública aplico autenticação, autorização por recurso, TLS, gestão de
segredos, validação estrita, queries parametrizadas, rate limit, CORS mínimo,
headers seguros, logs redigidos e erros seguros. Também mantenho dependências
atualizadas, auditoria, monitoramento e testes de abuso. Nesta entrega local,
os controles de transporte e validação existem; autenticação e produção não.

### 6. Qualidade e entrega

Defino o MVP pela menor fatia que entrega valor e testa os riscos principais,
não pela lista maior de recursos. Para este caso: criar, persistir, publicar,
processar SLA, refletir o estado na SPA e recuperar falhas. Segurança essencial,
contratos, testes críticos e execução reproduzível não são débito técnico;
analytics, notificações, escala preventiva e outros extras são evolução explícita.

### 7. Governança e IA

Uso IA para acelerar exploração, rascunhos, testes e revisão, mas não para
transferir responsabilidade técnica. Não envio segredos ou dados pessoais ao
modelo; reviso mudanças, dependências e permissões, e valido com testes, linters
e execução real. Decisões e contratos ficam versionados para que o time consiga
entender, questionar e manter o sistema sem depender do prompt original.

## Escopo não implementado

Autenticação/autorização, multitenancy, anexos, notificações, WebSocket/SSE,
analytics, Kafka, Kubernetes, event sourcing e infraestrutura de produção estão
fora do escopo desta demonstração.
