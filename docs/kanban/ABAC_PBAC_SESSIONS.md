# Kanban — Segurança, fundações e próximas entregas

**Baseline:** #1–#6 integradas/Done. #16 / 12.1 implementada e em validação/integração; acompanhar aceite na PR e issue.
**GitHub Projects:** https://github.com/users/luismschiazza/projects/2 — Animal Feed Warehouse — Engenharia e Entregas (projeto existente, não duplicado).
**Princípios:** deny-by-default, menor privilégio, autorização no servidor, isolamento por organização e auditoria.

## Ready

- [ ] [#12 Reforço de sessões e segurança de contas](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/12) — principal aberta/Ready; planejamento aprovado em oito sub-issues #16–#23. GitHub prevalece sobre alternativas históricas do plano versionado.

## Backlog

- [ ] [#13 CI/CD e qualidade automatizada](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/13) — CI real e critérios de integração; CD condicionado aos ambientes. [Plano](../issues/CI_CD_AUTOMATED_QUALITY.md).
- [ ] [#14 Ambientes, observabilidade e recuperação](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/14) — operação proporcional, secrets/permissões, alertas e restore ensaiado. [Plano](../issues/ENVIRONMENTS_OBSERVABILITY_RECOVERY.md).
- [ ] [#15 Gestão de funcionários e vínculos empresariais](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/15) — delegação e revogação seletiva, preservando identidade pessoal e B. [Plano](../issues/EMPLOYEE_MEMBERSHIP_MANAGEMENT.md).

- [ ] #17–#23: planejamento da #12, preservado em Backlog; próximo ticket #17 somente após concluir #16 e nova autorização. Não iniciar automaticamente.
- [ ] #24: performance independente, p95 < 300 ms sob carga documentada; sem benchmark nesta entrega.

#13–#15 preservadas em Backlog, sem implementação antecipada. O planejamento atual e dependências constam nas issues nativas.

## Em andamento / Em revisão

#16 — configuração por organização, padrão 3, pessoal independente/indefinido, PBAC/ABAC/auditoria e CAS de configuração. Sem contador/admissão/substituição. [Estudo](../authorization/SESSION_LIMIT_CONFIGURATION_STUDY.md). Autorização de execução limitada a este ticket; integração/encerramento somente após testes e revalidação da main.

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
