# CI/CD e qualidade automatizada

Issue real: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/13 — **Backlog**. Não implementada.

## Objetivo e problema
Transformar as evidências locais de #2–#6 em verificações repetíveis para toda PR. Hoje não há CI remoto configurado; não confundir testes executados pelo agente com pipeline ou proteção obrigatória de branch.

**Somente planejamento nesta execução; Backlog.**

## Escopo
- GitHub Actions com versão Node/npm compatível, instalação reprodutível e cache seguro.
- Lint, TypeScript incluindo testes, build, unitários, integração/HTTP e E2E.
- MongoDB descartável/isolado para sessões/ABAC/provisionamento, smoke do AppModule real e smoke de ACL/CLI com MongoDB autenticado.
- Verificação de dependências/vulnerabilidades e tratamento documentado de achados, sem npm audit fix/atualizações major automáticas indiscriminadas.
- Checks estáveis para critérios obrigatórios de integração e documentação do pipeline/diagnóstico.
- CI primeiro; CD controlado para ambiente elegível somente após critérios de ambientes/recuperação/secrets. Não presumir deploy automático em produção.

## Fora do escopo
Provisionar produção, escolher cloud/Kubernetes, implementar regras comerciais/segurança de contas ou resolver qualquer vulnerabilidade por mudança breaking sem análise. Não adicionar infraestrutura para aparentar maturidade.

## Requisitos funcionais e de segurança
1. PR/push devem executar jobs determinísticos, sem utilizar MONGO_URL de aplicação ou conta/email real.
2. Usar URIs de teste separadas e bancos únicos; preparar explicitamente as coleções de auditoria nos testes conforme #6; limpar apenas recursos gerados.
3. Container autenticado verifica privilégios reais de auditoria; credenciais são sintéticas e descartáveis, nunca secrets de produção.
4. Permissões mínimas do workflow; PR não confiável não recebe secrets nem acesso de escrita. Não combinar pull_request_target com execução de código de fork privilegiada.
5. Actions/dependências e cache devem ter política de confiança/pinning; logs/artifacts não incluem tokens, URLs autenticadas, payloads ou credenciais.
6. Timeout/cancelamento/cleanup não podem mascarar falhas; teste não é “aprovado” porque foi skipped por falta de MongoDB.
7. Definir checks requeridos e regras de proteção de main na configuração GitHub. Se faltar permissão/plano, registrar bloqueio, não afirmar que check obrigatório está ativo.

## Critérios de aceite verificáveis
- [ ] PR de demonstração executa todos os comandos de qualidade e testes previstos com sucesso no GitHub Actions.
- [ ] Alteração propositalmente inválida de lint/TypeScript/teste deixa check vermelho; não pode integrar sob a política escolhida.
- [ ] MongoDB de teste, inclusive ACL autenticada, é isolado e não depende de banco externo ou produção.
- [ ] Auditoria/revogação, A/B/pessoal, IDOR, replay/CAS e regressões passam no ambiente do runner.
- [ ] Verificação de dependências tem política de severidade/exceções com prazo/responsável, sem ocultar achados.
- [ ] Required checks/proteção de main conferidos e documentados, ou impedimento explicitamente aberto.
- [ ] Documentação mostra execução local equivalente, troubleshooting, versões, limites e pré-condições de eventual CD.

## Testes necessários
Validar triggers de PR/push, permissões em PR não confiável, falhas de cada job, limpeza/cancelamento, reexecução, cache e versões; testes unitários/integração/E2E/smokes existentes reais; revisão de vazamento de secrets/artifacts. Rodar pipeline remotamente: YAML e mocks sozinhos não comprovam CI.

## Dependências e riscos
#6 integrada e scripts atuais de testes; acesso Actions/configuração do repositório. Pode ser preparada em paralelo ao planejamento de contas, mas não substitui aprovação das políticas. CD depende da issue de ambientes/observabilidade/recuperação. Riscos: falso verde/skips, supply chain, secrets em fork/cache/artifact, flakes de concorrência, custo de runners e diferenças Windows/Linux.

## Checklist de execução
- [ ] Inventariar comandos/versões e permissões existentes sem repetir implementação de segurança.
- [ ] Desenhar jobs e MongoDBs descartáveis com credenciais sintéticas.
- [ ] Implementar e validar workflow em PR, inclusive falhas deliberadas.
- [ ] Conferir proteção/required checks e segurança de secrets.
- [ ] Documentar pipeline, evidências remotas e limitações de CD.
- [ ] Revisar/integrar/validar main e atualizar Kanban apenas após aceite.

## Documentação de estudo exigida
Criar `D:\programacao\documentos\ISSUE_13_CI_CD_ESTUDO_E_EXECUCAO.md`, versão no repositório e continuidade em agents. Explicar CI versus CD, jobs/services/cache/secrets, exemplos pequenos de YAML/Node/MongoDB, arquivos, resultados reais do Actions, testes de falha, critérios de merge e riscos restantes.
