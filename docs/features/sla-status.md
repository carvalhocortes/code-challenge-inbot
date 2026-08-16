# Status operacional do Prazo de SLA

## Escopo

A lista de Tickets passa a exibir uma coluna com o status relativo ao Prazo de
SLA, permitir filtrar por esse status e ordenar pelo tempo restante. O recurso
abrange o contrato compartilhado, a consulta paginada da API e a apresentação
responsiva no front.

## Regra

O percentual restante é calculado como:

```text
(slaDueAt - agora) / (slaDueAt - createdAt) * 100
```

As divisões são avaliadas nesta ordem:

| Status     | Regra                                                                    | Cor visual |
| ---------- | ------------------------------------------------------------------------ | ---------- |
| `overdue`  | prazo vencido                                                            | vermelho   |
| `critical` | prazo ainda não vencido e percentual restante menor que o limite crítico | vermelho   |
| `alert`    | percentual restante entre os limites crítico e de alerta, inclusive      | amarelo    |
| `on_track` | percentual restante maior que o limite de alerta                         | verde      |

Tickets sem `slaDueAt` ainda calculado retornam `slaStatus: null` e
`slaRemainingMs: null`; eles não entram em filtros de status do SLA.

## Configuração

- `SLA_CRITICAL_THRESHOLD_PERCENT`, padrão `10`.
- `SLA_ALERT_THRESHOLD_PERCENT`, padrão `40`.

O backend rejeita valores fora de `0..100` ou uma configuração em que o limite
crítico não seja menor que o limite de alerta.

## Contrato e consulta

`GET /tickets` aceita `slaStatus` e `slaSort=remaining_asc|remaining_desc`.
Filtro, ordenação e paginação são aplicados no PostgreSQL para que a página
retornada seja consistente com a seleção. A resposta inclui `slaStatus` e
`slaRemainingMs`, além do `slaDueAt` já existente.

## Decisões e limites

- O status é derivado em leitura; não é persistido como uma segunda fonte de
  verdade e muda naturalmente com o relógio.
- O percentual usa o intervalo efetivamente representado por `createdAt` e
  `slaDueAt`, preservando o prazo calculado pelo calendário útil.
- O estado de processamento continua separado do status do SLA. Um prazo ainda
  não calculado é explicitamente distinguido dos quatro estados operacionais.
