# Front-end — experiência, páginas e critérios de aceite

**Status:** Aceito para implementação

**Versão:** 0.1

**Data:** 2026-08-14

## 1. Objetivo

Definir a experiência da SPA React para o operador de suporte antes do primeiro componente ser implementado. O front-end deve tornar visíveis três coisas: o trabalho que precisa de atenção, o prazo de SLA e o estado assíncrono do processamento.

O produto é uma central operacional de tickets. Não será uma cópia do site institucional nem um dashboard de métricas de marketing.

## 2. Referência de marca

A direção visual é inspirada na página oficial da InBot: [inbot.com.br/pt](https://inbot.com.br/pt/). A referência usa linguagem de estrutura, operação em tempo real, ecossistema integrado, fundo escuro, contraste alto, gradientes azuis/ciano e acentos magenta.

O site institucional é referência de tom e composição, não fonte de dados do desafio. Não vamos copiar depoimentos, métricas, logos de clientes ou imagens proprietárias sem asset aprovado. Caso os assets oficiais não estejam disponíveis, usaremos formas abstratas e CSS, sem criar uma falsa associação comercial.

## 3. Direção de produto e linguagem

### 3.1 Usuário e tarefa principal

O usuário é o operador de suporte. Sua tarefa principal é criar um ticket, acompanhar o processamento do SLA e agir quando houver mudança, conflito ou falha.

### 3.2 Conceito visual

**Centro de Operação Conversacional:** uma superfície escura e calma para o shell, com sinais luminosos reservados para estados que exigem atenção. A assinatura visual será uma faixa de sinal de SLA e processamento, combinando azul/ciano para fluxo normal e magenta apenas para alerta ou falha.

O visual deve parecer operacional, não um painel genérico de administração:

- usar números e estados reais da API;
- evitar gráficos decorativos sem decisão associada;
- manter uma ação primária clara por página;
- destacar processamento assíncrono sem transformar a tela em animação constante.

### 3.3 Tom de texto

Português do Brasil, direto e orientado a ação. A linguagem pode reutilizar o campo semântico da marca — centro, estrutura, operação, integração, tempo real — sem prometer capacidades fora do desafio.

Exemplos:

- Eyebrow: `Centro de operação`.
- Título da lista: `Tickets em movimento`.
- Subtítulo: `Acompanhe prioridade, SLA e processamento em um só lugar.`
- Ação primária: `Novo ticket`.
- Estado vazio: `Nenhum ticket encontrado`.
- Falha: `Não foi possível carregar os tickets`.
- Processamento: `Atualizando cálculo de SLA`.

Status exibidos podem ser traduzidos na interface, mas os enums da API continuam em inglês conforme [contratos HTTP](03-contratos-http.md).

## 4. Tokens visuais propostos

Os valores abaixo são tokens de implementação inspirados na página oficial, não uma extração do manual de marca. Antes da publicação, devem ser comparados aos assets oficiais disponíveis.

| Token | Valor inicial | Uso |
| --- | --- | --- |
| `color.canvas` | `#07111F` | Fundo principal do shell |
| `color.surface` | `#0D1B2E` | Cards, tabela e painéis |
| `color.surfaceRaised` | `#132641` | Hover, foco e painéis elevados |
| `color.text` | `#F6F8FC` | Texto principal em fundo escuro |
| `color.textMuted` | `#AAB9CC` | Texto auxiliar |
| `color.brand` | `#1687FF` | Ação primária e links |
| `color.signal` | `#2BC3D4` | Processamento ativo e sucesso informativo |
| `color.alert` | `#A638FF` | Falha, conflito ou SLA vencido |
| `color.canvasLight` | `#F6F8FC` | Superfície alternativa em formulário |
| `color.border` | `#28415F` | Divisores e contornos |

Gradientes só devem aparecer em elementos de destaque, como o cabeçalho da página ou o sinal de processamento. O texto deve continuar legível sem depender da cor.

### 4.1 Tipografia

- Display: `Space Grotesk`, fallback `system-ui, sans-serif`.
- Texto: `Inter`, fallback `system-ui, sans-serif`.
- IDs, horários e estados técnicos: `IBM Plex Mono`, fallback `ui-monospace, monospace`.

Se fontes externas não forem empacotadas, a aplicação deve funcionar com os fallbacks. Não adicionar uma chamada remota que bloqueie o carregamento.

## 5. Shell e navegação

O shell é compartilhado por todas as páginas da aplicação:

- marca `InBot` e identificação `Centro de tickets`;
- navegação para `Tickets`;
- indicador discreto de conectividade da API;
- conteúdo principal com largura máxima e espaçamento consistente;
- foco visível, skip link e landmarks semânticos (`header`, `nav`, `main`);
- responsividade: tabela densa em desktop e cartões empilhados em telas menores.

Rotas:

| Rota | Página | Regra |
| --- | --- | --- |
| `/` | Redirecionamento | Redireciona para `/tickets`. |
| `/tickets` | Central de tickets | Lista, filtros, paginação e entrada para criação. |
| `/tickets/new` | Novo ticket | Formulário dedicado, compartilhável e acessível. |
| `/tickets/:id` | Detalhe do ticket | Estado, SLA, processamento, ações e histórico. |
| `*` | Não encontrado | Mensagem clara e retorno para a central. |

Não haverá página de login: autenticação e autorização estão fora do escopo desta entrega. Não haverá rota de edição completa; status e prioridade serão alterados por ações contextualizadas no detalhe.

## 6. Páginas

### 6.1 Central de tickets — `/tickets`

**Objetivo:** permitir localizar rapidamente tickets e enxergar quais ainda dependem do processamento ou da ação do operador.

**Conteúdo:**

1. Cabeçalho com eyebrow `Centro de operação`, título `Tickets em movimento`, subtítulo e botão `Novo ticket`.
2. Faixa de indicadores derivados da resposta da API: `Aguardando cálculo`, `Em processamento`, `Concluídos` e `Com falha`. Os indicadores não inventam valores e podem ser omitidos quando a API não os fornecer.
3. Barra de filtros: busca textual, status, prioridade, botão limpar e paginação.
4. Tabela desktop ou cartões mobile com título, prioridade, status, status do processamento, prazo de SLA, atualização e ação `Abrir`.
5. Sinal de atualização: `Atualizado agora` ou `Atualizando processamento`, sem recarregar a página.

**Estados obrigatórios:** carregando com skeleton, lista vazia, resultado vazio após filtro, erro recuperável, falha de paginação e estado normal.

**Dados:** TanStack Query controla consulta, cache, invalidação e polling. O polling de três segundos só ocorre enquanto houver ticket `pending` ou `processing` visível.

### 6.2 Novo ticket — `/tickets/new`

**Objetivo:** criar uma solicitação válida e informar ao operador que o SLA será calculado em segundo plano.

**Conteúdo:**

- título `Estruturar novo ticket`;
- campos `Título`, `Descrição`, `E-mail do solicitante` e `Prioridade`;
- legenda curta das prioridades e respectivos prazos-alvo;
- painel lateral de orientação: `O prazo de SLA será calculado após o cadastro`;
- botão `Criar ticket` e link de retorno para a central.

O formulário usa React Hook Form com resolver Zod. Erros são exibidos junto ao campo, em texto, e permanecem compreensíveis sem cor. O submit desabilita a ação durante a requisição e envia `Idempotency-Key`.

Após `201`, a página navega para o detalhe criado e mostra o status `Aguardando cálculo`. Erros `422`, `409` e indisponibilidade recebem Problem Details traduzido para uma mensagem operacional.

### 6.3 Detalhe do ticket — `/tickets/:id`

**Objetivo:** oferecer uma visão única do atendimento e permitir ações que respeitam concorrência otimista.

**Conteúdo:**

1. Breadcrumb e ação `Voltar para tickets`.
2. Identidade: `Ticket #...`, título, descrição, solicitante, prioridade e status de negócio.
3. Cartão `Prazo de SLA`, com data/hora, indicador `No prazo` ou `Vencido` e legenda de que o horário é útil.
4. Sinal visual `Processamento`: `Pendente`, `Processando`, `Processado` ou `Falhou`, com última atualização e ação `Reprocessar` quando aplicável.
5. Ações de status e prioridade em menu ou modal contextual. Toda mutação envia `If-Match` e atualiza a versão exibida.
6. Linha do tempo `Histórico do atendimento`, somente leitura e ordenada do mais recente para o mais antigo.
7. Disclosure `Detalhes de processamento` para dados técnicos não essenciais ao operador.

**Conflitos e falhas:** `412` ou `409` não podem desaparecer em um toast efêmero. A tela informa que o ticket mudou, preserva a ação do usuário e oferece `Recarregar ticket`. Falha definitiva mostra causa operacional segura e `Reprocessar`, quando permitido.

## 7. Componentes por responsabilidade

| Componente | Responsabilidade |
| --- | --- |
| `AppShell` | Layout, navegação, skip link e status global da API |
| `BrandMark` | Marca e assinatura visual sem depender de imagem proprietária |
| `KpiStrip` | Indicadores derivados da consulta de tickets |
| `TicketFilters` | Query string, busca, filtros e limpeza |
| `TicketTable` / `TicketCard` | Representação responsiva da lista |
| `TicketStatusBadge` | Tradução visual e textual dos estados |
| `SlaSignal` | Prazo, vencimento e processamento, com texto acessível |
| `HistoryTimeline` | Histórico imutável do ticket |
| `ProblemState` | Erros, retry e conflitos de forma consistente |
| `TicketForm` | Formulário Zod/RHF e envio idempotente |

Cada componente visual recebe dados já tipados. Regras de transição, cálculo e decisão de retry permanecem no domínio/API, não em JSX.

## 8. Imagens e assets

O front usará o logo e ilustrações oficiais somente se forem fornecidos ou licenciados para a entrega. A ausência deles não bloqueia o produto: `BrandMark`, fundos, orbitais e sinais de processamento serão construídos com CSS/SVG simples e acessível.

Não usar:

- logos de clientes da página institucional como decoração;
- depoimentos ou métricas do site;
- imagens de pessoas geradas para simular produto real;
- ícones que dependam apenas de emoji ou cor.

## 9. Acessibilidade, responsividade e movimento

- HTML semântico, labels explícitos e mensagens associadas por `aria-describedby`.
- Fluxo completo por teclado, foco visível e foco devolvido ao modal que o abriu.
- `aria-live="polite"` apenas para mudança de processamento; não anunciar cada polling.
- Contraste mínimo WCAG AA para texto e controles.
- Estado de erro com texto e ação, nunca apenas borda vermelha.
- `prefers-reduced-motion` desativa pulsos e transições não essenciais.
- Em mobile, filtros podem abrir em painel; ações críticas continuam acessíveis sem gesto de arrastar.

## 10. Cenários BDD de aceitação

```gherkin
Funcionalidade: Central de tickets

  Cenário: operador consulta tickets em processamento
    Dado que a API retorna um ticket com processingStatus "processing"
    Quando o operador abre "/tickets"
    Então ele vê o ticket e o texto "Em processamento"
    E a interface agenda nova consulta sem recarregar a página

  Cenário: operador cria ticket e acompanha o SLA
    Dado que o operador está em "/tickets/new"
    E informa título, descrição, e-mail e prioridade válidos
    Quando confirma "Criar ticket"
    Então a aplicação envia uma chave de idempotência
    E navega para o detalhe retornado pela API
    E mostra "Aguardando cálculo" até o processamento terminar

  Cenário: formulário impede dados inválidos
    Dado que o operador deixou o título vazio
    Quando tenta criar o ticket
    Então o envio não é realizado
    E o erro é anunciado junto ao campo título

  Cenário: operador percebe conflito de concorrência
    Dado que o detalhe foi carregado na versão 3
    E outro comando alterou o ticket para a versão 4
    Quando o operador tenta alterar o status usando a versão 3
    Então a tela informa que o ticket mudou
    E oferece recarregar o ticket antes de tentar novamente

  Cenário: operador recupera falha definitiva do SLA
    Dado que o ticket está com processingStatus "failed"
    Quando o operador abre o detalhe
    Então vê uma mensagem operacional segura
    E vê a ação "Reprocessar" quando a API permitir

  Cenário: interface funciona sem mouse
    Dado que o operador usa apenas teclado
    Quando navega pela central e abre um ticket
    Então todos os controles recebem foco visível
    E nenhuma ação depende exclusivamente de cor, hover ou arrastar
```

## 11. Fora do escopo do front

- Autenticação, autorização, perfis e troca de usuário.
- Chat em tempo real ou canal de atendimento humano.
- Dashboard analítico, gráficos históricos e exportação.
- Upload de arquivos e anexos.
- Editor completo de ticket.
- Páginas institucionais `Sobre`, `Cases`, `Blog` e `Contato`.
- WebSocket/SSE; a atualização desta entrega usa polling documentado.

## 12. Definition of Done do front

- [ ] Rotas e redirecionamento implementados.
- [ ] Lista, formulário e detalhe cobrem estados normal, carregando, vazio, erro e conflito.
- [ ] Polling condicional não recarrega a página e é interrompido quando não há processamento pendente.
- [ ] Formulário usa schema Zod compartilhado e envia `Idempotency-Key`.
- [ ] Mutações usam `If-Match`/`ETag` e tratam `412`.
- [ ] Acessibilidade básica validada por teste E2E e revisão manual por teclado.
- [ ] Nenhum dado fictício do site institucional é apresentado como dado do produto.
- [ ] Critérios BDD acima têm testes Playwright ou justificativa registrada.
