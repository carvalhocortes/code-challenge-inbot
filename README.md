# Gestão de Tickets

Plataforma Full Stack para cadastro, acompanhamento e processamento assíncrono de tickets de suporte. Projeto criado para avaliação técnica de Desenvolvedor Full Stack Sênior.

## Estado atual

O repositório está na fase de especificação. Escopo, regras de negócio, critérios de aceite e cenários BDD já estão documentados. Aplicação, containers e comandos de execução serão adicionados nas próximas etapas.

## Objetivos

- Criar e consultar tickets.
- Atualizar status e prioridade com regras explícitas.
- Manter histórico básico e imutável.
- Calcular SLA em segundo plano.
- Integrar com uma API pública de feriados.
- Tratar retry, idempotência e falhas definitivas.
- Atualizar a SPA sem recarregar a página.
- Executar toda a solução com Docker Compose.

## Arquitetura planejada

- Frontend: React e TypeScript.
- API: Node.js e TypeScript.
- Worker: processo Node.js separado da API.
- Banco de dados: PostgreSQL.
- Fila: BullMQ com Redis.
- Integração externa: feriados nacionais da BrasilAPI.
- Infraestrutura local: Docker Compose.

API e Worker compartilharão regras e contratos no mesmo monorepo, mas executarão como processos independentes.

## Fluxo principal

1. Operador cria ticket pela SPA.
2. API valida e persiste ticket como `pending`.
3. API publica job no BullMQ.
4. Worker consulta feriados e calcula vencimento do SLA.
5. Worker atualiza processamento para `processed` ou `failed`.
6. SPA acompanha mudança por polling, sem F5.

## Documentação

- [Escopo, entrega e especificação BDD](docs/01-escopo-entrega-e-bdd.md)

Documento contém atores, glossário, regras, endpoints previstos, itens fora do escopo, riscos, Definition of Done e cenários Gherkin de validação.

## Como iniciar

### Estado atual

Não existe aplicação executável neste commit inicial. Para revisar planejamento:

```bash
git clone <URL_DO_REPOSITORIO>
cd <DIRETORIO_DO_REPOSITORIO>
```

Depois, consulte `docs/01-escopo-entrega-e-bdd.md`.

### Execução planejada

Quando implementação estiver disponível, fluxo de inicialização será:

```bash
cp .env.example .env
docker compose up --build
```

README será atualizado com portas, health checks, migrations, testes e diagnóstico antes da entrega final.

## Testes planejados

- Unitários para regras de status e cálculo de SLA.
- Integração para API, PostgreSQL, fila e Worker.
- Interface para estados assíncronos e conflitos.
- Ponta a ponta para fluxo criação, processamento e atualização sem reload.

Cenários Gherkin funcionam como contratos de comportamento e critérios de aceite.

## Escopo excluído

- Kafka e microservices.
- Autenticação e autorização.
- Kubernetes e deployment em cloud.
- WebSocket e Server-Sent Events.
- Event sourcing e CQRS.
- Dashboard analítico e aplicativo mobile.

Lista completa e justificativas estão na documentação de escopo.

## Entrega final prevista

- Código-fonte versionado.
- Execução completa via Docker Compose.
- Migrations e `.env.example`.
- Testes automatizados dos fluxos críticos.
- Respostas das perguntas abertas da avaliação.
- Decisões arquiteturais e trade-offs.
- Plano de evolução para alto volume.
- Roteiro reproduzível de demonstração.
