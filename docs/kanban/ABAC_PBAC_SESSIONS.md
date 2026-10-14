# Kanban — Autorização ABAC/PBAC e sessões

**Branch atual:** `feat/issue-2-device-sessions`
**GitHub Projects:** https://github.com/users/luismschiazza/projects/2
**Banco atual:** MongoDB/Mongoose  
**Princípios:** deny-by-default, menor privilégio, autorização no servidor, isolamento por organização e auditoria.

## Backlog

- [ ] #03 Criar infraestrutura de políticas PBAC e guard de autorização.
- [ ] #04 Aplicar ABAC: organização, propriedade do recurso, vínculo e estado da conta.
- [ ] #05 Criar gestão de sessões: listar, revogar uma e revogar todas.
- [ ] #06 Criar auditoria de autenticação e decisões de autorização.
- [ ] #07 Reforçar login, senha e recuperação de conta.
- [ ] #08 Cobertura de testes unitários, integração e cenários de isolamento.

## Em andamento

_Nenhum item ativo enquanto a #2 aguarda revisão e integração._

## Em revisão

- [ ] #02 Sessões por dispositivo e rotação segura de refresh token: implementada e validada localmente (36 testes unitários, 11 de integração/HTTP com MongoDB e 1 E2E). Integração à main pendente; não fechar antes da entrega integrada.

Detalhes: [implementação e validação](../authorization/DEVICE_SESSIONS_IMPLEMENTATION.md).

## Concluído

- [x] #01 Papéis empresariais e matriz inicial: issue encerrada e entrega publicada em branch. Exceção histórica: ainda sem integração à main.

As branches de implementação e a main não possuem ancestral comum. Definir integração sem reescrever/apagar histórico antes de concluir novas entregas. #07 e #08 são itens de planejamento local, não issues numeradas confirmadas nesta revisão.

## Critérios de aceite globais

1. Sem política explícita, o acesso é negado.
2. Um usuário nunca lê, altera ou revoga recurso/sessão de outra organização ou usuário sem política que autorize.
3. Sessões de celular e computador são independentes.
4. Refresh token é de uso único, rotacionado atomicamente e com detecção de reutilização.
5. Toda decisão relevante é testada e eventos sensíveis são auditáveis sem registrar senha ou token.
