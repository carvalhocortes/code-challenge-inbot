# ADRs — decisões arquiteturais

ADRs registram decisões difíceis de reverter, surpreendentes para quem lê o código e resultantes de trade-offs reais. Não são um depósito para BDD, contratos HTTP, checklists ou planos operacionais.

## ADRs atuais

| ADR | Tema | Estado |
| --- | --- | --- |
| [001](001-stack-tecnologica-e-arquitetura.md) | Stack, fronteiras e decisões D1–D12 | Aceita |

## Classificação dos documentos atuais

| Documento | Tipo | Por que não é ADR |
| --- | --- | --- |
| `docs/01-escopo-entrega-e-bdd.md` | Escopo e comportamento | Define o que o produto faz e como validar. |
| `docs/02-seguranca-owasp.md` | Matriz de controles | Lista evidências, riscos e cenários de segurança. |
| `docs/03-contratos-http.md` | Contrato de integração | Define requests, responses, headers e erros consumidos por clientes. |
| `docs/04-checklist-pre-codigo.md` | Plano de execução | Organiza tarefas e ordem de implementação. |
| `docs/05-front-end.md` | Especificação de experiência | Define páginas, conteúdo, estados e critérios de aceite visual. |
| `docs/06-estrategia-de-dados-e-escala.md` | Operação e evolução | Define seed, demonstração, testes e caminho de escala. |
| `CONTEXT.md` | Glossário | Mantém linguagem do domínio sem detalhes de implementação. |

## Próximas ADRs candidatas

O ADR-001 concentra as decisões tomadas durante o refinamento. Depois que o código existir, só vale extrair novas ADRs se a separação preservar contexto e reduzir ambiguidade. Candidatas reais:

- contrato de compatibilidade e versionamento da API, se houver consumidores além da SPA;
- estratégia de publicação da especificação OpenAPI, se design-first e geração code-first divergirem;
- política de retenção/particionamento do histórico, quando houver requisito de volume;
- mudança de polling para SSE/WebSocket, somente se uma medição justificar.

Não serão criadas ADRs separadas apenas para cada biblioteca ou para cada componente visual. Essas escolhas já estão consolidadas no ADR-001 e podem ser revistas sem criar uma nova fronteira arquitetural.
