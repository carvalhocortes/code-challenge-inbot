# Contratos HTTP e catálogo de erros

**Status:** Aceito para implementação

Este documento transforma as decisões do grilling em contratos observáveis para a API e a SPA. Schemas executáveis ficarão no pacote `shared` e serão implementados com Zod.

## 1. Convenções gerais

- JSON usa `camelCase`.
- Datas são serializadas em ISO-8601 UTC.
- IDs são UUIDs representados como strings.
- Respostas de sucesso usam `application/json`.
- Respostas de erro usam `application/problem+json`.
- Problem Details segue [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807.html) por compatibilidade histórica e [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) como referência atual; RFC 9457 obsoleta RFC 7807.
- `requestId` é gerado pela API quando não for recebido e aparece na resposta e nos logs.

## 2. Headers

| Header | Uso |
| --- | --- |
| `X-Request-Id` | Correlação opcional enviada pelo cliente; a API gera um valor se ausente. |
| `Idempotency-Key` | Obrigatório em `POST /tickets`; identifica uma tentativa lógica de criação. |
| `ETag` | Retornado em consultas e mutações de Ticket; representa a versão atual. |
| `If-Match` | Obrigatório em mutações de Ticket existentes; deve conter o ETag conhecido. |
| `Content-Type` | `application/json` em requests com corpo. |
| `Accept` | A API prioriza `application/json` e `application/problem+json` para erros. |

O ETag da versão `3` é `"3"`. Ausência de `If-Match` retorna `428 Precondition Required`; versão divergente retorna `412 Precondition Failed`.

## 3. Problem Details

Formato base:

```json
{
  "type": "/problems/ticket-version-conflict",
  "title": "Ticket version conflict",
  "status": 412,
  "detail": "O Ticket foi alterado por outra operação.",
  "instance": "/tickets/8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2",
  "code": "ticket.version_conflict",
  "requestId": "req_01JEXAMPLE",
  "errors": []
}
```

Regras:

- `code` é estável e destinado ao tratamento pelo cliente.
- `detail` é seguro para exibição e não contém SQL, stack trace, tokens ou dados internos.
- `errors` é uma lista opcional de falhas por campo:

```json
{
  "field": "requesterEmail",
  "reason": "invalid_format"
}
```

- `type` identifica a classe do problema; não exige endpoint público nesta entrega.
- Erros inesperados usam `internal.unexpected` e mensagem genérica.

## 4. Catálogo inicial

| HTTP | Código | Uso |
| ---: | --- | --- |
| 400 | `request.invalid_json` | JSON malformado ou sintaxe de request inválida. |
| 400 | `idempotency.key_required` | Criação sem `Idempotency-Key`. |
| 404 | `ticket.not_found` | Ticket inexistente. |
| 409 | `ticket.status_transition_invalid` | Transição de status não permitida. |
| 409 | `ticket.closed` | Operação não permitida em Ticket fechado. |
| 409 | `idempotency.key_reused` | Chave usada com payload diferente. |
| 412 | `ticket.version_conflict` | `If-Match` não representa a versão atual. |
| 422 | `request.validation_failed` | Dados estruturados, mas inválidos para o contrato. |
| 428 | `ticket.precondition_required` | Mutação sem `If-Match`. |
| 429 | `rate_limit.exceeded` | Limite de requisições excedido. |
| 503 | `dependency.unavailable` | PostgreSQL, Redis ou dependência necessária indisponível. |
| 500 | `internal.unexpected` | Erro não classificado; detalhes apenas nos logs. |

## 5. Endpoints

### `POST /tickets`

Request:

```json
{
  "title": "Acesso ao sistema indisponível",
  "description": "O operador não consegue acessar o sistema desde as 09:00.",
  "requesterEmail": "operador@example.com",
  "priority": "high"
}
```

Regras:

- `title`: 3–120 caracteres após normalização.
- `description`: 10–2.000 caracteres após normalização.
- `requesterEmail`: e-mail válido.
- `priority`: `critical`, `high`, `medium` ou `low`.
- O Ticket nasce com `status: open`, `processingStatus: pending`, `version: 1` e `slaDueAt: null`.
- A API persiste Ticket, histórico, idempotência e Outbox na mesma transação.

Sucesso: `201 Created`, com Ticket criado e `ETag` da versão.

### Replay de criação

Para a mesma chave e o mesmo hash canônico do payload:

- retorna o status, body e ETag originais;
- não cria Ticket, histórico ou intenção Outbox adicional;
- inclui `Idempotency-Replayed: true`.

Para a mesma chave com hash diferente: `409` e `idempotency.key_reused`.

### `GET /tickets`

Query params:

- `page`: padrão `1`.
- `pageSize`: padrão `10`, máximo `100`.
- `q`: busca textual em título e descrição.
- `status`: filtro por status de atendimento.
- `priority`: filtro por prioridade.

Resposta:

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

Ordenação: `createdAt DESC, id DESC`.

### `GET /tickets/:id`

Retorna o Ticket e seu Histórico do Ticket. Sucesso: `200 OK`, com ETag da versão atual. Ticket inexistente: `404`.

### `PATCH /tickets/:id/status`

Request:

```json
{
  "status": "in_progress"
}
```

Exige `If-Match`. Sucesso: `200 OK`, incrementa `version`, persiste histórico e retorna Ticket atualizado com novo ETag.

### `PATCH /tickets/:id/priority`

Request:

```json
{
  "priority": "critical"
}
```

Exige `If-Match`. Sucesso: `200 OK`, persiste histórico, marca o processamento como `pending` e cria nova intenção de cálculo.

### `POST /tickets/:id/reprocess`

Exige `If-Match`. Se o Ticket estiver `failed` ou possuir nova versão pendente, cria uma nova intenção de processamento. Sucesso: `202 Accepted`, com Ticket em processamento pendente. Reprocessamento de cálculo concluído sem nova versão é rejeitado.

### `GET /health/live` e `GET /health/ready`

- `live`: confirma que o processo está vivo.
- `ready`: confirma PostgreSQL e Redis disponíveis.
- BrasilAPI não bloqueia readiness; falha externa é tratada pelo Worker.

## 6. Contrato do job assíncrono

Fila: `ticket-sla`.

`jobId` determinístico:

```text
ticket:{ticketId}:processing:{version}
```

Payload:

```json
{
  "ticketId": "8d3f6f3e-8aab-4ef6-a6b5-0ef7a8b9a1f2",
  "processingVersion": 3
}
```

O payload não contém e-mail, descrição ou outro dado pessoal. PostgreSQL é a fonte de verdade; Redis/BullMQ transporta apenas a intenção identificada.

## 7. Hash de idempotência

O payload será normalizado como JSON canônico com chaves ordenadas, codificado em UTF-8 e submetido a SHA-256. A tabela persiste o hash, não precisa duplicar o payload original, e armazena metadados suficientes para replay da resposta.

## 8. Responsabilidades de validação

- Zod valida forma, tipos, limites e enums de transporte.
- Adapters HTTP traduzem falhas de parsing para Problem Details.
- Casos de uso validam regras de negócio e transições.
- Repositórios e constraints PostgreSQL protegem invariantes de persistência.
- O Frontend não é fonte de verdade para nenhuma regra crítica.
