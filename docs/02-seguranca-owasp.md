# Segurança — OWASP Top 10:2025

**Status:** Aceito para implementação

Este documento mapeia os riscos aplicáveis ao desafio. Ele não representa certificação ou conformidade integral. A referência vigente é o [OWASP Top 10:2025](https://owasp.org/Top10/2025/); a [página do projeto](https://owasp.org/www-project-top-ten/) mantém versões históricas.

## Critério

Cada categoria possui aplicabilidade, controle, evidência e risco residual. Quando uma capacidade está fora do escopo, isso é declarado; não será apresentado como controle implementado.

## Matriz

| Categoria | Aplicabilidade | Controles planejados | Evidência | Risco residual |
| --- | --- | --- | --- | --- |
| **A01 Broken Access Control** | Parcial | Não haverá identidade, autorização por Ticket ou perfis. Rotas aceitarão somente operações do fluxo definido e não haverá endpoints administrativos ocultos. | BDD de transições, Ticket inexistente e operações proibidas. | Alto para exposição pública: não há autorização real. Limitação explícita do desafio. |
| **A02 Security Misconfiguration** | Sim | Node 22 fixado, imagem `bookworm-slim`, usuário non-root, Helmet, CORS por allowlist, limite de body, env validado, health checks e sem secrets versionados. | Compose reproduzível, teste de readiness, inspeção de headers e revisão do `.env.example`. | Ambiente local não terá hardening de cloud, TLS terminante ou WAF. |
| **A03 Software Supply Chain Failures** | Sim | `pnpm-lock.yaml`, versões fixadas, revisão de dependências, `pnpm audit`, sem Bun/Turborepo desnecessários e dependências mínimas. | Lockfile, comando de auditoria e inventário no README. | Auditoria local não substitui SCA contínuo ou assinatura de artefatos. |
| **A04 Cryptographic Failures** | Parcial | Nenhuma senha ou dado financeiro será tratado; não haverá criptografia customizada. Secrets entram por ambiente e não por Git. | Busca por secrets, revisão de configuração e ausência de dados sensíveis nos logs. | TLS e gestão de secrets de produção estão fora do ambiente local. |
| **A05 Injection** | Sim | Zod nas fronteiras, Drizzle/`pg` com parâmetros, sem SQL concatenado, React sem HTML não confiável e URL da BrasilAPI controlada por configuração. | Testes de payload inválido, strings de busca, campos textuais e revisão de queries. | Não haverá scanner DAST completo nesta entrega. |
| **A06 Insecure Design** | Sim | BDD, invariantes de domínio, concorrência por ETag, idempotência, Outbox transacional, retry classificado e histórico imutável. | Cenários Gherkin, testes unitários e integração de falhas. | O modelo não cobre multiempresa, autenticação ou abuso de negócio avançado. |
| **A07 Authentication Failures** | Fora do escopo | Autenticação e autorização não serão implementadas; o ator é um Operador de suporte de confiança no cenário de demonstração. | Limitação no README, nesta matriz e na entrega final. | Não afirmar que o sistema está pronto para exposição pública. |
| **A08 Software or Data Integrity Failures** | Sim | Lockfile, hash canônico de idempotência, `jobId` determinístico, payload mínimo, Outbox, lease recuperável e Worker idempotente. | Testes de replay, crash entre Redis/PostgreSQL e reprocessamento. | Não há assinatura de imagens ou pipeline de supply-chain completo. |
| **A09 Security Logging & Alerting Failures** | Sim | Pino JSON, `requestId`, `ticketId`, `jobId`, tentativa, redaction de e-mail/descrição/secrets e nenhum stack trace na resposta. | Teste de correlação e inspeção de logs de erro. | Não haverá alerting ou retenção centralizada de produção. |
| **A10 Mishandling of Exceptional Conditions** | Sim | Problem Details, códigos estáveis, timeout, retry/backoff, falha definitiva, readiness, graceful shutdown e tratamento de erro centralizado. | Testes de dependência indisponível, timeout, 4xx/5xx, Redis fora e migration falha. | Não cobre disaster recovery ou chaos testing amplo. |

## Controles mínimos verificáveis

- Nenhum segredo, token, SQL ou stack trace em respostas HTTP.
- Toda entrada externa passa por Zod ou por uma validação equivalente no adapter.
- Toda query usa parâmetros ou API segura do Drizzle.
- Toda mutação existente exige `If-Match`.
- Toda criação usa `Idempotency-Key` e hash canônico.
- Redis não contém dados pessoais no payload do job.
- Logs são estruturados e redigidos.
- `pnpm audit` e revisão do lockfile fazem parte da validação pré-entrega.

## Cenários de validação

```gherkin
Feature: Security baseline
  As a technical evaluator
  I want security controls to be observable
  So that the demo does not hide unsafe behavior

  @integration
  Scenario: Return a safe problem detail for invalid input
    Given the API is ready
    When the operator submits invalid ticket data
    Then the response content type is "application/problem+json"
    And the response contains a stable error code
    And the response does not contain a stack trace or SQL
    And no Ticket is persisted

  @integration
  Scenario: Reject a stale mutation with a precondition error
    Given a Ticket has ETag "3"
    When the operator updates it with If-Match "2"
    Then the API responds with status 412
    And the response code is "ticket.version_conflict"
    And no new history entry is persisted

  @integration
  Scenario: Redact sensitive values from logs
    Given a request contains an email and a description
    When the request fails validation
    Then the structured log contains requestId
    And the log does not contain the email or description

  @integration
  Scenario: Keep readiness truthful when Redis is unavailable
    Given the API process is alive
    And Redis is unavailable
    When the evaluator checks readiness
    Then liveness remains successful
    And readiness reports the dependency as unavailable
```

## Limitações assumidas

Autenticação, autorização, TLS de produção, WAF, SCA contínuo, DAST completo, alerting centralizado e gestão de secrets em cloud não fazem parte desta entrega. Essas limitações serão exibidas ao avaliador, nunca mascaradas como segurança implementada.
