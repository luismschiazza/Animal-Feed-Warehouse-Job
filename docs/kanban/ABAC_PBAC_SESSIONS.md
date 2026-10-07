# Kanban — Autorização ABAC/PBAC e sessões

**Branch:** `feat/abac-pbac-session-authorization`  
**Banco atual:** MongoDB/Mongoose  
**Princípios:** deny-by-default, menor privilégio, autorização no servidor, isolamento por organização e auditoria.

## Backlog

- [ ] #01 Definir domínio de organização, papéis e matriz de permissões.
- [ ] #02 Criar modelo de sessões por dispositivo e rotação segura de refresh token.
- [ ] #03 Criar infraestrutura de políticas PBAC e guard de autorização.
- [ ] #04 Aplicar ABAC: organização, propriedade do recurso, vínculo e estado da conta.
- [ ] #05 Criar gestão de sessões: listar, revogar uma e revogar todas.
- [ ] #06 Criar auditoria de autenticação e decisões de autorização.
- [ ] #07 Reforçar login, senha e recuperação de conta.
- [ ] #08 Cobertura de testes unitários, integração e cenários de isolamento.

## Em andamento

_Nenhum item iniciado. Aguardando definição do domínio de “síndico”._

## Em revisão

_Nenhum item._

## Concluído

_Nenhum item._

## Critérios de aceite globais

1. Sem política explícita, o acesso é negado.
2. Um usuário nunca lê, altera ou revoga recurso/sessão de outra organização ou usuário sem política que autorize.
3. Sessões de celular e computador são independentes.
4. Refresh token é de uso único, rotacionado atomicamente e com detecção de reutilização.
5. Toda decisão relevante é testada e eventos sensíveis são auditáveis sem registrar senha ou token.
