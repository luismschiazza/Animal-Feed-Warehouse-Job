# Kanban — Segurança, fundações e próximas entregas

**Última entrega:** #6 integrada à main pela PR #11, merge 07e47d0; validação repetida na main antes de CLOSED/Done.
**GitHub Projects:** https://github.com/users/luismschiazza/projects/2 — Animal Feed Warehouse — Engenharia e Entregas (projeto existente, não duplicado).
**Princípios:** deny-by-default, menor privilégio, autorização no servidor, isolamento por organização e auditoria.

## Ready

- [ ] [#12 Reforço de sessões e segurança de contas](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/12) — **somente estudo/definição**. Políticas, limites e excedentes precisam de acordo com responsável ANTES de implementar. [Plano](../issues/SESSION_ACCOUNT_HARDENING.md).

## Backlog

- [ ] [#13 CI/CD e qualidade automatizada](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/13) — CI real e critérios de integração; CD condicionado aos ambientes. [Plano](../issues/CI_CD_AUTOMATED_QUALITY.md).
- [ ] [#14 Ambientes, observabilidade e recuperação](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/14) — operação proporcional, secrets/permissões, alertas e restore ensaiado. [Plano](../issues/ENVIRONMENTS_OBSERVABILITY_RECOVERY.md).
- [ ] [#15 Gestão de funcionários e vínculos empresariais](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/15) — delegação e revogação seletiva, preservando identidade pessoal e B. [Plano](../issues/EMPLOYEE_MEMBERSHIP_MANAGEMENT.md).

As quatro issues contêm objetivo/problema, escopo/fora, requisitos, aceite verificável, testes, dependências/riscos, checklist e estudo exigido. Prioridade P1, áreas/tipo e ordem 7–10 preenchidos. Não foram implementadas. Os números propostos #7–#10 não foram reutilizados indevidamente: GitHub compartilha sequência com PRs; números reais são #12–#15.

## Em andamento / Em revisão

_Nenhum item após a entrega da #6. Não iniciar as futuras issues por interpretar Ready como autorização de implementação._

## Concluído

- [x] #06 Auditoria geral: PR #11, implementação cb5a7a8/merge 07e47d0. 218 unitários/19 suítes, 65 HTTP/sessões/PBAC/ABAC, 13 vínculos/provisionamento, 1 E2E, smoke AppModule real e smoke ACL/CLI com MongoDB autenticado; build/lint/tipos/diff aprovados, repetidos na main. Eventos/consulta protegida, redação de logs, regras autoritativas preservadas, exportação e operação sem purga. [Estudo](../authorization/SECURITY_AUDIT_IMPLEMENTATION_STUDY.md).
- [x] #05 Gestão de sessões: PR #10 (76f1852), 204 unitários/53 HTTP/13 vínculos no aceite histórico. [Estudo](../authorization/SESSION_MANAGEMENT_IMPLEMENTATION_STUDY.md).
- [x] #04 ABAC e isolamento: PR #9 (ecce0c8); filtros/referências/notificações, contas compartilhadas e bootstrap controlado. [Estudo](../authorization/ABAC_IMPLEMENTATION_STUDY.md).
- [x] #03 Infraestrutura PBAC: PR #8 (61eaf2d), integrada/encerrada após validação; números antigos no estudo são históricos. [Estudo](../authorization/PBAC_IMPLEMENTATION_STUDY.md).
- [x] #02 Sessões por dispositivo: PR #7 (cd31d07). [Estudo](../authorization/DEVICE_SESSIONS_IMPLEMENTATION.md).
- [x] #01 Papéis empresariais/matriz: encerrada e integrada preservando histórico pelo PR #7.

Históricos reconciliados por merge normal, sem force-push, preservando commits e LICENSE. Apenas MongoDBs/contas/papéis descartáveis usados; nenhum banco real/email real alterado. Sem CI remoto configurado até a implementação futura da #13. Merge não significa implantação ou segurança absoluta.

## Critérios globais

1. Sem política explícita, acesso negado.
2. Sem acesso horizontal a recurso/sessão/evento de outro usuário/empresa sem política que autorize.
3. Sessões independentes e revogação efetiva nos próximos acessos/refreshes.
4. Refresh de uso único, CAS e replay comprovado; cliente single-flight.
5. Decisões relevantes testadas e eventos consultáveis, sem credenciais nos logs.
6. Validação real de persistência, integração e aceite na main antes de encerrar issue/Done.
7. Não apagar regras autoritativas aplicáveis; operação real/destrutiva exige autorização específica.
