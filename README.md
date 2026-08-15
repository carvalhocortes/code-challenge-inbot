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
