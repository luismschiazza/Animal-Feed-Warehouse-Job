# Reforço de sessões e segurança de contas

Issue real: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/12 — **Ready para estudo**. Não implementada.

## Objetivo e problema
Após #2–#6, consolidar políticas de proteção de contas contra abuso/comprometimento e quantidade excessiva de sessões. As fundações de isolamento/revogação/auditoria já existem; não refazê-las.

**Somente planejamento nesta execução. Ready para estudo e definição com o responsável; não implementar limites/políticas sem esse acordo.**

## Escopo
- Limites configuráveis de sessões simultâneas, por identidade/contexto/papel conforme decisão explícita.
- Política para excedentes: rejeitar novo login, substituir sessão mais antiga ou outra alternativa aprovada; considerar sessões pessoais/A/B e logins concorrentes.
- Revogação segura após troca/reset de senha, sem permitir a administrador empresarial alterar credencial global compartilhada.
- Proteção de login/refresh contra abuso, inclusive custo de bcrypt e amplificação de armazenamento da auditoria por requisições anônimas.
- Revisão de recuperação/verificação de contas: prova de identidade, segredo de alta entropia, verificador, expiração, uso único, resposta anti-enumeração e tratamento de resposta perdida.
- Avaliação de MFA para administradores, modalidades, inscrição, recuperação e perda do segundo fator; implementar somente decisão aprovada.

## Fora do escopo
CRUDs comerciais, funcionários/vínculos, bypass entre empresas, implantação/CI e alteração arbitrária do contrato de refresh estrito. Não antecipar MFA ou escolher números de limites silenciosamente.

## Requisitos funcionais e de segurança
1. Documentar limites/escopos, excedentes, janelas, mensagens, migração/configuração e exceções antes de escrever código.
2. A contagem deve considerar revogação lógica autoritativa, expiração e estado real, não só revokedAt físico.
3. Concorrência entre instâncias não pode ultrapassar o limite aceito: propor protocolo atômico verificável, sem supor que count+insert separado é seguro. Explicitar eventual dependência de transação/replica set antes da implementação.
4. Alteração de senha deve exigir prova adequada e revogar somente os contextos definidos pela política aprovada; não expor credenciais nem deixar janela de atualização/revogação não auditada.
5. Recuperação não concede vínculo/papel empresarial e não usa email/IP/User-Agent como prova suficiente de identidade.
6. Throttling deve avaliar ordem de guards/filtro/auditoria e proxy confiável; não introduzir bloqueio arbitrário que permita DoS dirigido contra outra pessoa.
7. Todos os eventos novos usam a auditoria #6 sem senha, JWT, token de recuperação ou dados sensíveis; preservar auth_session_revocations.

## Critérios de aceite verificáveis
- [ ] Documento de decisões aprovado pelo responsável com valores, escopos e comportamento de excedentes, antes de implementar.
- [ ] Dois dispositivos e A/B/pessoal têm comportamento previsível conforme a política aprovada.
- [ ] Teste concorrente real demonstra invariantes do limite e atomicidade escolhida.
- [ ] Troca/reset de senha deixa os tokens definidos pela política inutilizáveis, sem conceder alterações de conta global a admin de uma empresa.
- [ ] Login/refresh/recuperação têm controles de abuso verificáveis e respostas sem enumeração indevida.
- [ ] Decisão MFA registrada com riscos, implementação ou justificativa de adiamento, sem alegar proteção não existente.
- [ ] Regressões #2–#6, auditoria de sucesso/negação/falha e validações completas aprovadas antes de merge/Done.

## Testes necessários
Unitários de configuração/política; HTTP/MongoDB isolado para corridas no limite, expiração, regras lógicas e troca de senha versus refresh; recuperação válida/expirada/consumida/replay/segredo incorreto; abuso distribuído/proxy; isolamento A/B/pessoal e IDOR; falhas de persistência; logs sem segredos; regressões, E2E, root/ACL smoke, build/lint/TypeScript. Testes de persistência não podem ser só mocks.

## Dependências e riscos
#6 integrada; acordo explícito de produto/políticas; proteção de secrets/ambientes e CI devem acompanhar a execução quando disponíveis. Principais riscos: DoS por bloqueio/evicção, corrida entre instâncias, recuperação insegura, custo de auditoria, relógios e credenciais compartilhadas entre organizações. Não depende de já haver CRUD comercial.

## Checklist de execução
- [ ] Conferir main/contexto e regressões; estudar alternativas.
- [ ] Alinhar e registrar políticas/limites com o responsável.
- [ ] Projetar atomicidade, falhas, migração e auditoria.
- [ ] Implementar somente escopo aprovado em feature branch.
- [ ] Validar com MongoDB descartável, revisar diff e documentar riscos.
- [ ] PR/push/merge sem force-push; repetir aceite na main; atualizar issue/Kanban.

## Documentação de estudo exigida
Antes/durante a implementação criar `D:\programacao\documentos\ISSUE_12_SESSOES_E_CONTAS_ESTUDO_E_EXECUCAO.md`, equivalente versionado e continuidade em agents. Explicar problema, alternativas/decisão aprovada, o que/como/por quê, conceitos e exemplos TypeScript/NestJS/MongoDB, arquivos, testes reais, falhas/limitações e operação. Não prometer segurança absoluta.
