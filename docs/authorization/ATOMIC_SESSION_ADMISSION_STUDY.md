# #17 / 12.2 — Admissão atômica de sessões

## Estado atual — integrada e revalidada na main

Revisão técnica aprovada pelo responsável, PR #26 MERGED em `d86295c65f5a6522f146f5f35e1dbcdb292359d2`, após confirmar HEAD e01d926/base 215138b e MERGEABLE/CLEAN. **258 unitários/97 HTTP-MongoDB/13 vínculos/1 E2E, smokes AppModule/ACL autenticada/CLI, build/lint/TypeScript/diff PASS novamente NA MAIN**. Encerramento/Done autorizado SOMENTE após esse aceite; #12 aberta 2/8, #18 Backlog/NÃO iniciada, nenhuma implantação. [Aceite completo e comandos/evidências](ATOMIC_SESSION_ADMISSION_MAIN_ACCEPTANCE.md).

O registro de aceite prevalece sobre as proibições/estados antigos abaixo; o histórico de desenho, implementação e revisão permanece preservado.

## Estado e autorização pré-merge (histórico)

Implementação na branch `feat/issue-17-atomic-session-admission`, baseline `215138ba8d554d8b28c05a4dc5a0dea1ee250ddb`. #1–#6 e #16 integradas e preservadas. **Autorização mais recente: revisar relógio/contenção/rollout, corrigir/testar/documentar e CRIAR PR para main. SEM MERGE e SEM ENCERRAR #17 antes de nova aprovação.** #18 não iniciada. Não encontrado AGENTS.md no projeto/ancestrais; continuidade externa lida.

**PR atual: [#26 — OPEN para main](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/26), sem merge/encerramento, aguardando revisão do responsável.**

**Revisão atual:** [relatório pré-PR](ATOMIC_SESSION_ADMISSION_REVIEW.md) documenta TOCTOU comprovada e corrigida, leitura única snapshot sem escrita global por JWT, revalidação pós-CAS, contagem limitada, prova de contenção e barreira operacional de identidades legadas. Novos resultados: 258 unitários/97 HTTP-MongoDB/13 vínculos/1 E2E e smokes/build/lint/TypeScript aprovados NA BRANCH. O histórico da primeira entrega abaixo (dbc6922) é preservado; a revisão vinculada prevalece.

## Desenho registrado antes do código (histórico; revisão vinculada prevalece)

- Transação MongoDB, snapshot/primary e commit majority/journal. **Replica set obrigatório**; não instalar/provisionar produção. Dependência operacional da #14 explicitada, não implementada como infraestrutura real.
- Um documento de serialização por aplicação, atualizado PRIMEIRO em cada transação de admissão, alteração de limite e revogação. Conflito de escrita obriga nova tentativa com novo snapshot. O número de sequência NÃO é contador de sessões nem autoridade de revogação.
- Sob essa serialização, consultar configuração atual da #16, contar documentos de sessões do usuário/organização ainda não expirados/não revogados (incluindo lookup da coleção autoritativa auth_session_revocations), e inserir sessão na mesma transação. Count+insert separados sem esse protocolo continuam incorretos.
- Escopo server-side `animal-feed-warehouse`. A/B têm capacidade independente por usuário; configurações pertencem à organização. Pessoal mantém o comportamento existente sem quota numérica aprovada e jamais recebe fallback empresarial. Isso não aprova uma política pessoal ilimitada.
- Legado acima de limite reduzido permanece válido: bloquear novas admissões enquanto quantidade >= limite. Nunca escolher/revogar sessão automaticamente. Nenhum desafio, token temporário ou substituição da #18.
- Relógio MongoDB obtido no documento de serialização por $currentDate para nascimento/expiração/cutoff das novas operações. TTL só limpa, não autoriza. Validade usa $$NOW do MongoDB. Sequência transacional ordena sessões/cortes no mesmo milissegundo: regra nova usa revokedThroughSequence e sessão nova admissionSequence; se qualquer lado for legado, conserva semântica por data, sem backfill. Watermark persistido serverNow: mutações exigem $$NOW >= watermark anterior; leituras/autenticação/refresh verificam essa condição em primary/majority e falham fechado se houver regressão observável. Não zerar sequência nem recuar watermark para contornar erro.
- Sem ledger de capacidade, leases ou reservas duráveis: abort/crash antes do commit não deixa slot órfão. MongoDB aborta transações abandonadas segundo transactionLifetimeLimitSeconds. Timeout deve falhar fechado. Após commit com resposta perdida, sessão real pode ocupar capacidade; não apagar/revogar automaticamente. Titular usa gestão #5 ou aguarda expiração. Retries internos reutilizam SID/verificador gerados antes da transação e não fazem efeitos externos no callback.
- Todas as escritas de revogação e configuração participam do protocolo; nenhuma regra antiga é removida. Refresh conserva CAS, replay estrito e expiração absoluta; não cria nova capacidade. Revogações de replay entram no mesmo protocolo.
- Preservar auditoria sem segredos; quando escrita dentro de transação, usar a sessão da transação, sem writeConcern individual. Falha de auditoria antes de commit deve abortar o efeito associado. Login só entrega credenciais após confirmação e auditoria existente.
- Sem cache local, mutex em memória ou dependência de instância única. Serialização global por aplicação é deliberadamente conservadora e um possível gargalo; sem benchmark ou promessa p95/produção/failover. Otimização futura exige nova prova, fora da #17.
- Proibir versões antigas escrevendo em paralelo no rollout: parar API/workers antigos, provisionar somente metadados operacionais novos e iniciar versão consistente. Não tocar banco real nesta execução. Runtime não recebe privilégios de alteração/exclusão sobre journals append-only.

## Alternativas consideradas

Contador separado + sessão: rejeitado por dual-write/divergência. Lease com expiração: rejeitado porque escritor atrasado pode confirmar depois de liberar capacidade, exigindo fencing e coordenação com autoridade. Documento com array de todas sessões: rejeitado por tamanho/legado/duplicação de autoridade. Transação sem documento compartilhado: rejeitada por write skew, inclusive contra configuração/revogação. Transação com documento comum: escolhida por prova simples e rollback nativo; custo/dependência explicitados acima.

## Plano de validação

Unitários; regressões #1–#6/#16; HTTP em duas instâncias independentes com barreiras e MongoDB replica set descartável; A/B/pessoal; expiração sem depender de TTL; revogação específica/global/organizacional/exclusão da atual; reduções e aumentos concorrentes; refresh/replay; abort depois de gravação parcial, timeout real, crash e recuperação; índice/documento/topologia indisponíveis; auditoria; build/lint/TypeScript/diff. Resultados finais estão registrados abaixo; falhas intermediárias não são resultados aprovados. Não usar MONGO_URL real.

## O que mudou, como e por quê

### Prova e exemplo TypeScript

O erro clássico seria duas instâncias contarem 2 sessões com limite 3 e ambas inserirem uma quarta. Snapshot sozinho também permite esse write skew: cada transação escreve uma sessão diferente. A escrita obrigatória no mesmo documento cria conflito entre elas. A segunda transação precisa recomeçar com snapshot novo e enxergar a primeira.

Fluxo simplificado (o código real está nos arquivos abaixo):

```ts
await serialization.run(async (tx, serverNow, sequence) => {
  const policy = await readOrganizationSessionLimit(revisions, verifiedOrganizationId, tx);
  // Aggregate scoped by user AND organization, expiry and authoritative revocation lookup.
  const active = await countAuthoritativelyActive(tx, serverNow);
  if (active >= policy.limit) throw new ConflictException('Session limit reached');
  await insertSessionAndAdmissionAudit(tx, serverNow, sequence);
}); // credentials still withheld until successful commit and existing login audit
```

`countAuthoritativelyActive` e `insertSessionAndAdmissionAudit` acima são nomes didáticos, não funções adicionais ocultas. A implementação usa aggregate/create/record explicitamente. O callback pode repetir: credencial/SID são gerados uma vez antes dele, não se envia email/JWT/resposta dentro dele. O driver faz retries transientes/commit incerto com CSOT de 10s e maxCommitTimeMS de 5s; escrita do coordenador tem maxTimeMS de 5s. Auditoria externa/HTTP não têm promessa de latência total 10s.

### Invariantes e corridas

| Situação | Resultado/garantia |
|---|---|
| Duas admissões, um slot | Um commit ocupa o slot; concorrente reavalia snapshot/configuração e recebe 409. |
| Redução antes da admissão | Nova admissão observa limite menor; não apaga sessões existentes. |
| Redução depois da admissão | Sessão admitida sob limite anterior continua; total pode ficar acima do novo limite. Nenhum logout automático. |
| Revogação específica/lote | Regra e metadados de coordenação confirmam juntos; próximas admissões excluem sessões logicamente revogadas, mesmo sem revokedAt físico. |
| Nascimento e lote no mesmo ms | Sequência define antes/depois sem inventar deslocamento artificial do relógio. Exceção de sessão atual em others preservada. |
| Expiração durante a transação | Contagem no instante de serialização pode negar conservadoramente; próxima tentativa libera capacidade. TTL não decide. |
| Refresh concorrente | CAS/verificadores/histórico e TTL absoluto preservados; refresh não aumenta capacidade. Replay confirmado gera a regra pelo protocolo novo. |
| Crash antes do commit | Escritas parciais não ficam visíveis. Transação é abortada pelo MongoDB; não há reserva/contador a reconciliar. |
| Commit com conexão derrubada | Driver repete commit da MESMA transação, não cria nova sessão para cada tentativa. Estado incerto após deadline retorna indisponibilidade, nunca credenciais por suposição. |
| Commit confirmado, resposta/auditoria LOGIN perdida | Sessão real permanece contada; retry HTTP novo pode criar outra até o limite. Não há idempotência HTTP/exactly-once prometida. Recuperação via sessão pessoal existente/novo login pessoal e gestão própria #5, ou expiração. |
| Relógio retrocede abaixo de watermark | Novas mutações e verificações de sessões falham fechado até recuperação de relógio; não alterar watermark/seq para liberar. |
| Perda do documento de coordenação | Startup/admissões/validação falham fechado; CLI recusa reinicializar se encontrar sessões/regras ordenadas. Restaurar backup coerente/revisão operacional, jamais zerar silenciosamente. |

O watermark protege regressão observável, não cria um relógio externo infalível: disciplina NTP/UTC/relógios de JWT continua dependência da #14. Checagens são snapshots e não cancelam retroativamente uma operação já autorizada ou impedem um operador root de alterar dados. Restaurar metadados, sessões, regras e journals de forma inconsistente quebra premissas; não restaurar apenas o coordenador antigo por cima de estado novo. Nenhum mecanismo de recuperação automática destrutiva foi adicionado.

### Arquivos e responsabilidades

- `src/features/auth/services/session-serialization.service.ts`: replica set/startup, escrita comum, relógio/watermark, sequência, limites de tempo/retry/commit e sanitização de erro de infraestrutura.
- `schemas/session-serialization.schema.ts`, `models/session-serialization.module.ts`: metadado operacional mutável, DDL automática desabilitada, sem TTL, chave da aplicação controlada pelo servidor.
- `services/auth-sessions.service.ts`: política consumida internamente sem exigir papel administrativo, aggregate usuário+organização com lookup autoritativo, criação/auditoria na mesma transação, validade por relógio MongoDB. `schemas/auth-session.schema.ts`: recibos imutáveis opcionais de versão/sequência; legado não é preenchido silenciosamente.
- `services/session-limit-reader.ts`: leitura/validação compartilhada do valor default 3/versão 0 ou revisão persistida. Dentro da transação usa snapshot; fora preserva primary/majority.
- `services/session-limit-configuration.service.ts`: preserva PBAC/ABAC/expectedVersion/faixa 1..100/índice único; atualiza sob a mesma serialização e agora inclui evento geral na transação. **Melhoria explícita sobre #16:** falha de auditoria ANTES de commit aborta revisão e evento juntos. Incerteza APÓS commit continua possível; estudo antigo da #16 é histórico, não a descrição dessa mudança ainda não integrada.
- `services/session-revocations.service.ts`, `schemas/session-revocation.schema.ts`: regras continuam append-only e autoritativas; escrita transacional, ordem de lotes e leitura/lookup consistentes, incluindo legado e others.
- `src/common/audit/security-audit.{schema,service}.ts`: evento session_admission e sessão transacional opcional; fora de transação mantém majority/journal. Sem senha/refresh/JWT/hash/body nos eventos; actor/vínculo/papéis vêm da identidade já validada no login, nunca do DTO. Evento allowed de admissão prova criação, NÃO entrega HTTP.
- `src/commands/initialize-session-admission.script.ts`: inicialização consciente e sem fallback/repair; recusa perda perigosa de ordenação.
- Testes novos: `test/atomic-admission.integration-spec.ts`, processo filho `test/atomic-crash.worker.ts`, `test/session-admission-operations.smoke.ts`, unitário de serialização. Regressões e smokes anteriores ajustados exclusivamente para novo protocolo/topologia.

## Operação deliberada — NÃO executada em banco real

1. Decidir e provisionar topologia replica set/permissões/backup sob #14 e autorização operacional própria. Um nó de testes prova transações, NÃO alta disponibilidade/failover. Standalone falha no startup: não habilitar fallback.
2. Instalação nova: bootstrap empresarial consciente com API parada/banco sem dados ANTES de criar o documento de coordenação. O bootstrap existente recusa banco com dados; não relaxar essa proteção nem rodar seeders escolares.
3. No rollout, parar TODOS os escritores antigos. Protocolo não é compatível com versões antigas inserindo sessões/regras/revisões por fora dele. Não misturar versões numa implantação gradual sem manutenção coordenada.
4. Operador separado inicializa auditoria e journal de configuração pelos comandos existentes, depois `SESSION_ADMISSION_MONGO_URL=<URI explicitamente escolhida> npm run session-admission:initialize`. Não pôr URI/senha em Git/logs. CLI só cria coleção/documento operacional (não usuário/política/sessão), preserva sequência se repetido, não corrige corrupção, não apaga nada.
5. Runtime: privilégios anteriores e find/update/listIndexes SOMENTE em `session_serialization`, sem insert/remove/DDL/TTL nessa coleção. `auth_sessions` conserva privilégios específicos necessários ao CAS/TTL existente; três journals continuam find/insert/listIndexes e SEM update/delete/DDL/TTL. Privilégios aditivos de banco inteiro invalidam separação. Operador do CLI também precisa ler sessões/regras para detectar perda de estado ordenado.
6. Preservar coordenador junto de sessões/revogações/configuração/auditoria em backup/restore consistente. O exportador da #6 não se torna backup do coordenador nem muda suas fontes implicitamente. Não purgar regras para abrir capacidade. Monitorar indisponibilidade/contenda e corrigir relógio/topologia; jamais reduzir garantias para destravar.

Aplicação atual é server-side animal-feed-warehouse; journals/coordenador mantêm chave extensível. `auth_sessions` pertence a esta API; eventual compartilhamento de armazenamento com outra aplicação exige contrato/versionamento próprios, não integração CTA nesta entrega. Nenhum limite pessoal foi aprovado/definido. Serialização global é potencial gargalo e foi escolhida pela prova simples; otimização/benchmark #24 e implantação #14 ficam separados.

## Evidências finais e limitações

### Rodada da primeira entrega dbc6922 (histórico; NÃO validação na main)

| Verificação | Resultado |
|---|---|
| `npm test -- --runInBand` | **257 testes / 21 suítes** |
| `npm run test:sessions` com URI descartável explícita | **94 testes / 2 suítes**: 77 regressões + **17 novos cenários da #17** |
| `npm run test:abac` com URI descartável explícita | **13 testes / 2 suítes** de vínculos/provisionamento |
| `npm run test:e2e -- --runInBand` | **1 teste** |
| `npm run test:security-root` | **PASS** AppModule real, DI, prefixo/envelope, login/auditoria/negação e configuração |
| `npm run test:audit-operations` | **PASS** MongoDB COM autenticação: transação real com runtime restrito; abort de auditoria; atualização do coordenador permitida, insert/delete/TTL negados; journals continuam sem update/delete/DDL; exportador anterior preservado |
| `npm run test:session-admission-operations` | **PASS** CLI em banco único: sem fallback/contas/políticas; repetição preserva sequência; corrupção e perda perigosa de ordenação recusadas |
| `npm run build`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `git diff --check` | **Aprovados** |

Concorrência: cinco rodadas de 12 logins HTTP, duas aplicações Nest independentes/pools/sessões de driver e barreira pré-admissão: sempre 3 admissões e 9 recusas. Não são apenas mocks. O RS descartável tem um nó: isso NÃO testa eleição/failover/distribuição geográfica. Ambos os HTTPs rodam no processo de testes; o teste de crash usa processo Node separado real, encerrado por SIGKILL entre escrita parcial e commit. Não se afirma que dois servidores de produção foram implantados.

Cenários adicionais: A/B/pessoal/outra identidade; expiração sem TTL físico e durante a transação; redução/aumento/legado acima do limite sem logout; revogação lógica específica/global/organizacional/others com exclusão da atual; refresh/replay; ordenação de corte no mesmo ms; falha REAL de insert por validador MongoDB; auditoria LOGIN falhando após commit e recuperação por revogação própria explícita; timeout REAL por coordenador bloqueado; conexão de commit REAL derrubada via failCommand em servidor de teste; metadata/TTL/configuração inválidos; ausência de segredos/correlação. Regressão de relógio é simulada com watermark futuro no banco descartável (NÃO mudança de relógio do SO/NTP).

No teste de expiração, TTL monitor foi desabilitado APENAS no servidor descartável, provando que autorização/capacidade não dependem da remoção física. Transações abandonadas usam lifetime 5s APENAS no teste; no teste de timeout aumenta-se temporariamente para 60s, restaurando 5s no finally. Produção mantém seu planejamento operacional próprio.

### Falhas intermediárias, sem esconder resultados

- Tipagens do create transacional/lean e novas dependências de construtor ajustadas; TypeScript final incluindo testes aprovado.
- Expectativas antigas 500/quantidades de sessões/semântica pós-write foram adaptadas explicitamente: infraestrutura agora 503; setup de redução não cria logins acima de quota; falha de auditoria pré-commit aborta também revisão da #16. Não se apagaram testes de segurança para obter verde.
- Expectativa inicial de refresh 201 corrigida para o contrato existente 200; formatação e tabela `it.each` de teste de clock corrigidas.
- Uma rodada completa intermediária sofreu timeout do hook/monitor Docker e ECONNRESET; não foi aceita como validação. O servidor descartável permaneceu isolado; rodadas completas posteriores passaram. Rodada final: 94/94, 257/257 e demais itens acima aprovados.

### Limite do aceite da primeira entrega dbc6922 (histórico)

Diff revisado em relação à main `215138b`: somente #17, documentação/testes/CLI correlatos; nenhum endpoint de substituição/desafio, recuperação de senha, MFA, worker/outbox ou CRUD comercial adicionado. #16 mantém API/política/versionamento; a melhoria transacional de falha pré-commit foi documentada e testada. #1–#6 continuam cobertas pelas regressões. Sem force-push, reescrita de histórico ou dados reais.

#17 permanece OPEN e em revisão, #12 aberta (1/8); #18 e seguintes NÃO iniciadas. Não existe PR nem merge desta entrega. Falta aprovação do responsável, depois eventual PR/integração/revalidação na main para encerrar/Done. Não há CI remoto, benchmark, auditoria externa, teste de eleição ou certificação de produção. Os estudos de #16 e fundações permanecem históricos preservados. Relatório externo equivalente: `D:\programacao\documentos\ISSUE_17_TICKET_12_2_ESTUDO_E_EXECUCAO.md`.

### Reprodução e limpeza

Criar SOMENTE servidor descartável dedicado (exemplo Git Bash, não implantação):

```bash
docker run -d --rm --name issue17-example-tests -p 127.0.0.1::27017 mongo:8 \
  --replSet issue17test --bind_ip_all \
  --setParameter enableTestCommands=1 \
  --setParameter transactionLifetimeLimitSeconds=5 \
  --setParameter ttlMonitorEnabled=false
docker exec issue17-example-tests mongosh --quiet --eval \
  'rs.initiate({_id:"issue17test",members:[{_id:0,host:"127.0.0.1:27017"}]})'
docker port issue17-example-tests 27017
# Aguardar primary e usar a porta descoberta, NÃO porta histórica:
# SESSIONS_TEST_MONGO_URL='mongodb://127.0.0.1:<porta>/?directConnection=true&replicaSet=issue17test' npm run test:sessions
# ABAC_TEST_MONGO_URL=<mesma URI descartável> npm run test:abac
# SESSIONS_TEST_MONGO_URL=<mesma URI descartável> npm run test:security-root
# SESSIONS_TEST_MONGO_URL=<mesma URI descartável> npm run test:session-admission-operations
docker stop issue17-example-tests
```

`enableTestCommands`, TTL desativado e lifetime reduzido são EXCLUSIVAMENTE para testes. O smoke ACL exige outro RS descartável COM autenticação/keyfile e `AUDIT_TEST_ADMIN_URL` explícita local, nunca administrador real. Não copiar credenciais em relatórios/commits. Bancos de cada teste são únicos e removidos pelos testes; CLI smoke usa `sessions_test_init_*`, root smoke `audit_root_test_*`, ACL `audit_acl_test_*`.

**Limpeza desta execução confirmada:** containers dedicados `issue17-atomic-tests` e `issue17-acl-tests` parados/removidos (`--rm`), sem outros containers afetados. Portas 58663/54416 são HISTÓRICAS, não reutilizar cegamente. Dados/usuários/papéis/volumes anônimos desses servidores eram descartáveis. Nenhum banco/conta/email real tocado. Aprovação para PR/merge continua pendente.
