# Ambientes, observabilidade e recuperação

Issue real: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/14 — **Backlog**. Não implementada.

## Objetivo e problema
Preparar operação proporcional ao estágio do produto, separando desenvolvimento/teste/staging/produção e tornando falhas detectáveis/recuperáveis. A auditoria #6 é fundação de software, não prova de implantação, backup, monitoramento ou recuperação.

**Somente planejamento nesta execução; Backlog. Evitar infraestrutura desnecessária.**

## Escopo
- Contratos local/dev/test/staging/prod, configuração validada, secrets e rotação/acesso.
- Logs estruturados redigidos, correlação da #6, métricas de baixo risco/cardinalidade e monitoramento/alertas proporcionais.
- Capacidade/indisponibilidade de auditoria, erros de escrita/leitura, volume anônimo e armazenamento/retenção.
- Backups, cópia protegida/externa, restauração testada, RPO/RTO definidos com responsável e procedimento de incidente.
- Orientações de implantação segura: TLS/proxy confiável, CORS, Swagger, prefixo/envelope de API, inicialização de índices, permissões MongoDB por coleção e rollback/release.

## Fora do escopo
Kubernetes/multirregião/microservices sem necessidade demonstrada, CRUDs comerciais, regras definitivas de sessões/MFA, deploy em banco real ou migração destrutiva sem autorização específica. Não tratar exportação JSONL da #6 como backup consistente completo.

## Requisitos funcionais e de segurança
1. Configuração e bancos separados; testes nunca usam MONGO_URL real por fallback. Nenhuma credencial/URL autenticada em Git/log/artifact.
2. Operador distinto executa audit:initialize; credencial runtime de auditoria somente find/insert/listIndexes, exportador find. Não combinar com readWrite/dbOwner/root global que anule restrições.
3. auth_session_revocations deve ser restaurada/protegida junto ao estado de sessões ANTES de aceitar tokens; perda de regras pode reativar famílias. Definir invalidação deliberada em recuperação, sem apagar regras silenciosamente.
4. Definir retenção legal/negocial e arquivamento da auditoria com responsável; sem purga automática de regras aplicáveis. Hash/manifest exige cópia confiável; avaliar criptografia/WORM proporcionalmente.
5. Alertar falhas de auditoria externamente (o banco indisponível não registra seu próprio alerta), capacidade/disco e aumento de erros. Métricas não usam token/email/SID/tenant arbitrário como label de alta cardinalidade.
6. Restringir documentação Swagger/middleware conforme ambiente e revisar trusted proxy/headers. Não afirmar que guard de controller protege middleware.
7. Restauração/rollback devem ser ensaiados em ambiente isolado, sem modificar conta/dado de cliente. Escolher solução simples conforme orçamento e estágio.

## Critérios de aceite verificáveis
- [ ] Matriz de ambientes/secrets, responsáveis e acessos documentada/validada, sem valores reais publicados.
- [ ] Staging/local reproduz inicialização segura da auditoria com credenciais mínimas e recusa de índices inseguros.
- [ ] Logs/telemetria não expõem credenciais/PII; erro de auditoria simulado gera alerta externo verificável.
- [ ] Backup e restore completos testados em sandbox, incluindo regras de revogação; sessão revogada continua recusada após restauração.
- [ ] RPO/RTO e limites operacionais combinados, procedimento de incidente/rollback escrito e executável.
- [ ] Exposição de Swagger, CORS, TLS/proxy e contrato de API revisados antes de eventual deploy.
- [ ] Custos/complexidade justificados; pendências de infraestrutura registradas sem alegar prontidão inexistente.

## Testes necessários
Validação de env inválida/ausente; acesso mínimo real MongoDB; interrupção de serviços/escrita/leitura e alertas; retenção/exportação sem reativação; corrupção de archive/manifest; restore isolado e revogação pós-restore; logs redigidos; permissões/headers/CORS/Swagger em ambiente real de teste; regressões #2–#6 e qualidade padrão.

## Dependências e riscos
#6, decisões de negócio sobre retenção/RPO/RTO/orçamento e acesso operacional. Coordenar com CI/CD; nenhum CD de produção antes deste aceite e autorização de infraestrutura. Riscos: backup incompleto, perda de regras autoritativas, restauração de sessão antiga, secrets amplos, custo/DoS da auditoria, relógios desalinhados, alertas inexistentes e excesso de infraestrutura.

## Checklist de execução
- [ ] Levantar situação/orçamento e propor arquitetura mínima.
- [ ] Alinhar ambientes, retenção, responsabilidades e recuperação.
- [ ] Configurar somente infraestrutura autorizada, em sandbox primeiro.
- [ ] Ensaiar falhas/alertas/restore/rollback com evidências.
- [ ] Revisar permissões e exposição de API/documentação.
- [ ] Documentar operação e pendências; integrar somente com validações e sem prometer segurança absoluta.

## Documentação de estudo exigida
Criar `D:\programacao\documentos\ISSUE_14_AMBIENTES_OBSERVABILIDADE_RECUPERACAO.md`, versão no repositório e continuidade em agents. Explicar ambientes, secrets, métricas/logs versus auditoria, backup versus exportação, RPO/RTO, restauração segura e exemplos pequenos de configuração/TypeScript/MongoDB; registrar arquivos, ensaios reais, custos, limitações e operação.
