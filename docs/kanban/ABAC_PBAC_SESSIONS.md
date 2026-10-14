# Kanban — Autorização ABAC/PBAC e sessões

**Branch atual:** `feat/issue-4-abac-tenant-isolation`
**GitHub Projects:** https://github.com/users/luismschiazza/projects/2
**Banco atual:** MongoDB/Mongoose  
**Princípios:** deny-by-default, menor privilégio, autorização no servidor, isolamento por organização e auditoria.

## Backlog

- [ ] #05 Criar gestão de sessões: listar, revogar uma e revogar todas.
- [ ] #06 Criar auditoria de autenticação e decisões de autorização.
- [ ] #07 Reforçar login, senha e recuperação de conta.
- [ ] #08 Cobertura de testes unitários, integração e cenários de isolamento.

## Em andamento

- [ ] #04 ABAC e isolamento: etapa 1 de organizações/vínculos implementada e validada. Ainda não conectada a sessões/recursos; filtros dos serviços e migração pendentes. [Implementação e estudo](../authorization/ABAC_IMPLEMENTATION_STUDY.md).

## Em revisão

_Nenhum item._

## Concluído

- [x] #01 Papéis empresariais e matriz inicial: issue encerrada e código integrado pelo PR #7.
- [x] #02 Sessões por dispositivo: PR #7 integrado à main (cd31d07), issue encerrada após validação. [Relatório técnico](../authorization/DEVICE_SESSIONS_IMPLEMENTATION.md).
- [x] #03 Infraestrutura PBAC: entrega pelo PR #8 aprovada pelo responsável; integração e aceite rastreados na issue. 121 testes unitários, 12 integração/HTTP com MongoDB e 1 E2E aprovados. [Implementação e estudo](../authorization/PBAC_IMPLEMENTATION_STUDY.md).

Históricos reconciliados por merge sem force-push, preservando commits e LICENSE. #07 e #08 são itens de planejamento local, não issues numeradas confirmadas nesta revisão. Reforços adicionais serão planejados em conjunto após #6, antes dos CRUDs.

## Critérios de aceite globais

1. Sem política explícita, o acesso é negado.
2. Um usuário nunca lê, altera ou revoga recurso/sessão de outra organização ou usuário sem política que autorize.
3. Sessões de celular e computador são independentes.
4. Refresh token é de uso único, rotacionado atomicamente e com detecção de reutilização.
5. Toda decisão relevante é testada e eventos sensíveis são auditáveis sem registrar senha ou token.
