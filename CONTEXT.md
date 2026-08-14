# Gestão de Tickets

Este contexto descreve linguagem canônica do sistema de suporte. Serve para evitar termos ambíguos nas regras, cenários BDD, documentação e código.

## Linguagem

**Ticket**:
Solicitação de suporte acompanhada desde cadastro até encerramento.
_Evitar_: chamado, issue, solicitação

**Operador de suporte**:
Pessoa que cadastra, consulta e conduz atendimento dos tickets.
_Evitar_: usuário, agente, atendente

**Prioridade**:
Classificação da urgência de um Ticket, expressa como `critical`, `high`, `medium` ou `low`.
_Evitar_: severidade, nível

**Status de atendimento**:
Etapa atual do ciclo de atendimento de um Ticket, distinta do processamento assíncrono.
_Evitar_: status de negócio, status sem qualificador

**Status de processamento**:
Etapa do cálculo assíncrono do prazo de SLA, distinta do Status de atendimento.
_Evitar_: status sem qualificador, status do Ticket

**Prazo de SLA**:
Instante limite para resolução de um Ticket conforme sua Prioridade e calendário útil.
_Evitar_: SLA quando significar somente duração, prazo genérico

**Calendário útil**:
Conjunto de horários e dias considerados no cálculo do Prazo de SLA.
_Evitar_: horário comercial sem definição explícita

**Histórico do Ticket**:
Registro imutável da criação e das mudanças relevantes ocorridas em um Ticket.
_Evitar_: log, auditoria nominal

**Chave de idempotência**:
Identificador que representa uma tentativa lógica de criação e permite repetir a mesma operação sem duplicar seus efeitos.
_Evitar_: identificador de requisição, quando a intenção for deduplicação

**Intenção de processamento**:
Registro de que uma operação assíncrona precisa ser publicada e executada, mesmo antes de chegar à fila.
_Evitar_: job, quando ainda não houve publicação
