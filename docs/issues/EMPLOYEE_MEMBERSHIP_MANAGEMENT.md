# Gestão de funcionários e vínculos empresariais

Issue real: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/15 — **Backlog**. Não implementada.

## Objetivo e problema
Permitir provisionamento seguro de funcionários e administração de vínculos/papéis por empresa. Hoje há organização/vínculo e primeiro acesso controlado (#4), mas não há fluxo autorizado completo de funcionários. Cadastro público continua CUSTOMER pessoal, sem autoconcessão empresarial.

**Somente planejamento nesta execução; Backlog.**

## Escopo
- Convite seguro ou cadastro explicitamente autorizado, com decisão de produto sobre fluxo.
- Atribuição/alteração de papéis conhecidos POR organização, dentro dos privilégios delegáveis do ator.
- Ativação, suspensão e revogação de vínculo com estados/transições explícitos.
- Revalidação de ator/vínculo/sessão/política no serviço e auditoria #6.
- Testes de conta compartilhada A/B/pessoal e prevenção de autoconcessão/escalação de privilégio.

## Fora do escopo
Usuário público escolher empresa/papel, administrador de A alterar/excluir senha/conta global compartilhada, CRUD de produtos/estoque/financeiro, IAM de plataforma/global admin implícito ou troca indiscriminada do mecanismo de autenticação.

## Requisitos funcionais e de segurança
1. Políticas de quem convida/delega/suspende e quais papéis pode atribuir devem ser explícitas e aprovadas; OWNER não herda bypass.
2. Convite não é vínculo ativo. Se houver token, usar alta entropia/verificador/uso único/expiração, sem segredo em logs/auditoria. Email enviado não prova aceitação/identidade.
3. Identidade existente compartilhada não deve ser duplicada, sobrescrita ou apropriada por conhecer seu email. Definir prova de aceitação e vínculo com conta autenticada.
4. IDs de organização/ator/proprietário são server-side; consultas e escritas sempre combinam organização e alvo. Impedir IDOR, self-grant e alteração via campos não permitidos.
5. Definir proteção de último responsável/admin e concorrência de mudanças; não deixar organização sem operador ou permitir elevação por corrida.
6. Suspender/revogar vínculo em A NÃO suspende conta global, sessão pessoal/B nem todos os funcionários de A. Reativação não deve restaurar silenciosamente tokens antigos, conforme política aprovada.
7. Planejar revogação seletiva usuário+organização: NÃO reutilizar bulk global do usuário nem organization-all inteira. A fundação #5 não tem predicado user+organization dedicado; qualquer extensão deve manter atomicidade/auditoria e ser validada, sem enumeração ilimitada de SIDs.
8. Eventos de convite, papel e estado são auditados sem credenciais/PII desnecessária. Notificações usam dados/contexto validados e mailer falso nos testes.

## Critérios de aceite verificáveis
- [ ] Fluxo e matriz de delegação/transições aprovados, com convites/cadastro autorizado documentados.
- [ ] Ator autorizado provisiona/vincula funcionário somente em sua empresa; público/não autorizado não concede papel/vínculo.
- [ ] Convite expirado/consumido/forjado não ativa acesso; conta compartilhada exige aceite/prova apropriada.
- [ ] Papéis e estados atuais passam a valer sem confiar em JWT antigo; alteração de A não afeta B/pessoal/global credentials.
- [ ] Suspensão/revogação e reativação obedecem política de sessões, sem revogar usuários/contextos indevidos.
- [ ] Último responsável e operações concorrentes preservam invariantes definidos.
- [ ] Auditoria de sucesso/negação/falha e testes reais de isolamento/IDOR/privilege escalation aprovados, com regressões #2–#6 e pipeline quando disponível.

## Testes necessários
Unitários de políticas/transições/delegação; HTTP/MongoDB real com duas empresas e identidade compartilhada; convites válidos/expirados/replay/segredo incorreto; self-grant, downgrade/último admin concorrente, IDs externos/headers/body forjados; papel atual versus claims antigas; suspensão/reativação/refresh e falhas de persistência; auditoria/notificação sem segredo e sem email real; E2E/root/ACL smoke, build/lint/TypeScript.

## Dependências e riscos
#4–#6; alinhar com a issue de contas/sessões (revogação seletiva/reativação/recuperação) e preferir CI disponível antes de integrar fluxo sensível. Decisões de negócio sobre convites, papéis e último responsável. Riscos: apropriação de conta por email, autoconcessão, corrida de último admin, revogação global acidental, falhas efeito/auditoria e convites vazados. Não executar provisionamento de funcionários reais sem autorização operacional específica.

## Checklist de execução
- [ ] Ler fundações e matriz; definir fluxo com responsável.
- [ ] Projetar políticas, estados, delegação e invariantes concorrentes.
- [ ] Projetar efeito/auditoria e revogação seletiva preservando A/B/pessoal.
- [ ] Implementar controllers/DTOs/serviços com revalidação obrigatória.
- [ ] Testar MongoDB isolado e notificações falsas; revisar segurança/diff.
- [ ] Documentar estudo/contrato/riscos, PR/merge e aceite na main; atualizar Kanban.

## Documentação de estudo exigida
Criar `D:\programacao\documentos\ISSUE_15_FUNCIONARIOS_E_VINCULOS_ESTUDO_E_EXECUCAO.md`, versão no repositório e continuidade em agents. Explicar identidade versus vínculo, convite versus acesso, delegação, limites de organização, consistência/auditoria e revogação seletiva; exemplos TypeScript/NestJS/MongoDB, arquivos, testes reais, falhas e operação.
