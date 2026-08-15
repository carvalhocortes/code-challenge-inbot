# Estratégia de dados, demonstração e escala

**Status:** Aceito para implementação

**Versão:** 0.1

**Data:** 2026-08-14

Este documento define como produzir dados reproduzíveis para desenvolvimento e demonstração, como provocar falhas sem depender de serviços instáveis e como evoluir a solução se o cenário chegar a um milhão de acessos. Ele não transforma a demonstração em um ambiente de produção fictício.

## 1. Princípios

- Dados de demonstração devem ser explícitos, pequenos e descartáveis.
- Testes não dependem da BrasilAPI real, do relógio da máquina ou de uma ordem de execução anterior.
- Falhas externas devem ser reproduzíveis por uma porta de teste, não por alterações manuais no banco.
- PostgreSQL é a fonte de verdade; Redis e BullMQ transportam trabalho.
- A escala será decidida por métricas e carga observada, não por quantidade arbitrária de serviços.

## 2. Dados iniciais

O repositório terá um seed de desenvolvimento separado das migrations. O seed:

- cria tickets representando `pending`, `processing`, `processed` e `failed`;
- cobre as quatro prioridades e os quatro status de negócio;
- inclui títulos e descrições neutros, sem dados pessoais reais;
- cria histórico coerente com cada ticket;
- não cria chaves de idempotência ou outbox artificialmente publicados;
- pode ser executado mais de uma vez sem duplicar registros, usando identificadores determinísticos de desenvolvimento.

O fluxo principal da apresentação deve criar pelo menos um ticket pela interface, em vez de depender somente do seed. O seed serve para demonstrar filtros, paginação, falha e histórico imediatamente.

## 3. Relógio e calendário

O cálculo de SLA recebe um relógio injetável. Testes usam datas fixas; o ambiente de demonstração pode aceitar uma data inicial configurável apenas para acelerar o roteiro, sem alterar a regra de horário útil. Feriados são fornecidos por um adapter falso nos testes e pelo adapter BrasilAPI no fluxo de integração.

## 4. Simulação da API externa

O adapter de feriados terá uma implementação real e uma implementação fake controlada por teste. A fake deve permitir:

| Modo      | Comportamento esperado                          |
| --------- | ----------------------------------------------- |
| `success` | Retorna feriados válidos e conclui o cálculo.   |
| `timeout` | Simula timeout e permite observar retry.        |
| `429`     | Simula rate limit e permite observar backoff.   |
| `500`     | Simula erro transitório até a última tentativa. |
| `400`     | Simula falha definitiva sem retry.              |

O teste de integração usa a fake. Um smoke test manual, separado dos testes determinísticos, valida a configuração do endpoint BrasilAPI e deve ser omitido quando a internet estiver indisponível.

## 5. Isolamento de testes

- Cada suíte de integração inicia PostgreSQL e Redis pelo Compose de teste.
- As tabelas são truncadas entre cenários, respeitando as foreign keys.
- Redis usa namespace de teste e remove jobs, locks e chaves ao final.
- O relógio é restaurado após cada teste.
- Testes de retry aguardam o estado observável, nunca um `sleep` arbitrário longo.
- E2E inicia com banco limpo e termina removendo o ambiente temporário.

## 6. Roteiro de demonstração

1. Executar `docker compose up --build`.
2. Abrir a SPA e criar um ticket de prioridade `high`.
3. Mostrar o retorno imediato com `Aguardando cálculo`.
4. Mostrar a mudança para `Processado` sem F5 e o prazo calculado.
5. Aplicar filtro, busca e paginação na central.
6. Alterar status e prioridade e conferir o histórico.
7. Repetir uma criação com a mesma chave de idempotência e mostrar que não duplica o ticket.
8. Ativar o modo `timeout` ou `429`, mostrar tentativas e estado `Falhou`.
9. Voltar ao modo `success`, usar `Reprocessar` e mostrar a conclusão.
10. Executar testes unitários, integração e Playwright.

## 7. O que o desenho atual já cobre para alto volume

Para o desafio, as seguintes escolhas são boas fundações:

- API e Worker separados e stateless, permitindo réplicas independentes.
- Paginação e índices para a consulta inicial.
- Payloads limitados e contratos Zod para evitar entradas excessivas.
- BullMQ com retry e workers escaláveis horizontalmente.
- Outbox com lease, evitando perder intenção após commit no PostgreSQL.
- Cache de feriados com TTL para reduzir dependência externa.
- Polling apenas quando há processamento pendente.
- Configuração de conexões, timeouts, tentativas e limites por ambiente.

O que ainda não está coberto e não deve ser afirmado como pronto: alta disponibilidade, testes de carga, múltiplas regiões, failover automático, autenticação/autorização de produção e SLO validado.

## 8. Plano de evolução para um milhão de acessos

“Um milhão de acessos” não define capacidade sozinho. Antes de alterar a arquitetura, registraríamos período, concorrência máxima, proporção leitura/escrita, tamanho dos tickets, retenção e SLOs de latência/erro.

### Fase 1 — Medir

- Criar cenário de carga com tráfego realista e dados representativos.
- Medir p50/p95/p99, throughput, erros, filas, pool de conexões, CPU, memória e latência do PostgreSQL/Redis.
- Definir limites de alerta e capacidade por réplica.

### Fase 2 — Escalar o caminho de leitura

- Tornar API e frontend totalmente stateless atrás de balanceador e CDN.
- Adotar ETag/`If-None-Match` e polling com backoff/adaptação.
- Trocar paginação profunda por cursor baseado em `createdAt` e `id`.
- Revisar índices com `EXPLAIN ANALYZE`; adicionar réplica de leitura ou cache somente se a medição justificar.

### Fase 3 — Escalar escrita e processamento

- Aumentar réplicas do Worker por capacidade da fila, mantendo `jobId` e processamento idempotentes.
- Distribuir o Dispatcher por leases e particionar a carga por faixa de IDs se necessário.
- Usar Redis gerenciado/HA e política explícita de retenção de jobs.
- Aplicar rate limit por cliente e backpressure para proteger o banco.

### Fase 4 — Escalar persistência

- Dimensionar pool e introduzir PgBouncer quando o número de réplicas exigir.
- Arquivar ou particionar histórico por tempo se o crescimento justificar.
- Criar réplicas de leitura para consultas; manter mutações e consistência no primário.
- Revisar retenção de idempotência e outbox, mantendo auditoria necessária.

### Fase 5 — Operar com segurança

- Centralizar logs, métricas, traces e alertas de fila, erro externo e banco.
- Definir runbooks para Redis indisponível, BrasilAPI degradada, backlog e conflito de versão.
- Executar teste de carga e teste de recuperação antes de declarar a capacidade.

Nenhuma dessas fases será antecipada na implementação do desafio sem evidência de necessidade. A entrega demonstra as interfaces que tornam a evolução possível, não uma promessa de escala não medida.

## 9. Critérios de aceite desta estratégia

- [x] Seed reproduzível e separado de migrations.
- [x] Dados não contêm PII real.
- [x] Fake da BrasilAPI cobre sucesso, timeout, `429`, `500` e `400`.
- [x] Testes limpam PostgreSQL, Redis e relógio entre cenários.
- [x] Roteiro de demonstração cobre sucesso, idempotência, retry e reprocessamento.
- [x] README explica honestamente o que está coberto hoje e o que depende de carga.
- [x] Plano de escala começa por métricas e SLOs, não por serviços adicionados preventivamente.
