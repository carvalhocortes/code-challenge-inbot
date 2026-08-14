# Assistência usada no projeto

Esta pasta versiona as instruções de skills usadas para apoiar análise, refinamento e documentação do desafio. O objetivo é tornar o processo transparente e reproduzível para o avaliador.

## Origem

- Repositório: `https://github.com/mattpocock/skills`
- Commit de origem: `8b78b531ab965735c5dc74f6f7a219e1e37326df`
- Data da cópia: 2026-08-14
- Manifesto único de skills: [`../skills-lock.json`](../skills-lock.json)
- Licença original: [`LICENSE.mattpocock-skills`](LICENSE.mattpocock-skills)

## Skills incluídas

| Skill                                                | Uso no projeto                                                |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| [`grilling`](skills/grilling/SKILL.md)               | Fazer perguntas decisórias por rodadas, com recomendações.    |
| [`grill-me`](skills/grill-me/SKILL.md)               | Questionar planos sem produzir documentação.                  |
| [`grill-with-docs`](skills/grill-with-docs/SKILL.md) | Conduzir decisões e registrá-las em ADRs e glossário.         |
| [`domain-modeling`](skills/domain-modeling/SKILL.md) | Manter linguagem do domínio e critérios para criação de ADRs. |
| [`openapi-spec-generation`](skills/openapi-spec-generation/SKILL.md) | Criar, manter e validar contratos OpenAPI 3.1. |
| [`create-readme`](skills/create-readme/SKILL.md) | Criar e manter README conciso e orientado ao usuário. |

`grill-with-docs` depende de `grilling` e `domain-modeling`; por isso todas foram copiadas.

Todas as skills ficam registradas no manifesto único da raiz, no formato gerado pelo CLI `npx skills`.

## Dados de contexto

Skills não mantêm histórico privado da conversa. Contexto relevante fica em artefatos revisáveis do repositório:

- [`CONTEXT.md`](../CONTEXT.md): glossário canônico do domínio, sem decisões de implementação.
- [`docs/01-escopo-entrega-e-bdd.md`](../docs/01-escopo-entrega-e-bdd.md): escopo e critérios de aceite.
- [`docs/adr/`](../docs/adr/): decisões arquiteturais e alternativas consideradas.

Não são versionados prompts privados, transcrições, tokens, credenciais, arquivos globais do agente ou dados pessoais do ambiente local.

## Governança do uso de IA

- IA auxilia exploração, comparação de alternativas e redação inicial.
- Decisões permanecem humanas e precisam de confirmação explícita.
- Código e documentação gerados devem ser revisados e testados.
- Skills não substituem critérios de aceite nem evidências executáveis.
- Alterações futuras nas skills devem atualizar commit e hashes do manifesto.
