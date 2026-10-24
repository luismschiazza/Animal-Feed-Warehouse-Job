# #17 / 12.2 — Integração e aceite na main

## Autorização e resultado

O responsável aprovou tecnicamente a integração da PR #26, exigindo confirmar HEAD/base/conflitos/escopo, fazer merge e reexecutar testes/smokes na main. Autorizou encerrar #17 e atualizar #12 para **2/8** SOMENTE após aprovação de toda a rodada. Determinou parar/relatar em qualquer falha, sem iniciar #18 nem implantar em produção.

**Toda a rodada abaixo passou, sem corrigir código ou repetir uma rodada falha nesta integração.** Encerramento da #17/Done autorizado por essa condição cumprida. #12 permanece aberta; #18 e demais Backlog não foram iniciadas. Nenhuma outra issue foi alterada além de #17/#12.

Este registro substitui os estados anteriores “sem autorização para merge” dos estudos/revisão, preservados como histórico. Integração não é implantação nem certificação de produção.

## 1. Preflight e merge

| Item | Evidência |
|---|---|
| PR | [#26](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/26), base main, não draft |
| HEAD aprovado/local/remoto | `e01d9260766f562e27b764d3db2a5c7647405fbf` |
| Base antes do merge | `215138ba8d554d8b28c05a4dc5a0dea1ee250ddb` |
| Conflitos | GitHub `MERGEABLE` / `CLEAN`; diff check aprovado |
| Escopo | 33 arquivos: admissão/coordenação/relógio/auditoria correlata, testes, inicializador operacional e documentação da #17; #1–#6/#16 preservadas, nenhuma implementação #18 |
| Checks remotos | `statusCheckRollup: []`; não há CI remoto certificado nesta entrega |
| Integração | Merge normal, `--match-head-commit e01d926…`; sem force-push, reescrita, squash ou exclusão de branch |
| Merge/main testada | **`d86295c65f5a6522f146f5f35e1dbcdb292359d2`** |
| Estado depois do merge | PR MERGED; #17 continuou OPEN até completar e registrar o aceite |

A main local foi atualizada com fast-forward. Todos os comandos abaixo rodaram DEPOIS disso, no commit de merge real — não são reaproveitamento dos resultados da branch. O registro de aceite posterior altera somente Markdown.

## 2. Ambiente exclusivamente descartável

- Node **v24.19.0**, npm **12.2.0**.
- MongoDB **8.3.13**, imagem local `mongo:8`, ID `sha256:d0c8f51bb63fb1f992f4ff05293adb3f0967aaaae32c3e5fa567907800819b3b`.
- `issue17-main-tests`: replica set `issue17main`, um nó; porta histórica **60084**, vinculada somente a 127.0.0.1. Test commands habilitados para falhas controladas, transaction lifetime 5s, TTL monitor desabilitado.
- `issue17-main-acl`: replica set `issue17mainacl`, um nó autenticado/keyfile; porta histórica **65190**, somente 127.0.0.1. Principal administrativo SOMENTE descartável; smoke cria principais de escrita, leitura e legado em banco único descartável.
- URIs explícitas `SESSIONS_TEST_MONGO_URL`, `ABAC_TEST_MONGO_URL` e `AUDIT_TEST_ADMIN_URL`. Nenhum fallback para banco da aplicação, nenhuma conta/dado/email real.
- **Ambos os containers foram parados/removidos com --rm**, confirmando lista vazia por nome. Nenhum outro ambiente foi parado/alterado. Não reutilizar essas portas/URIs históricas cegamente.

Um nó e duas aplicações/pools independentes no mesmo host NÃO certificam distribuição geográfica, eleição, failover, HA, TLS, benchmark ou produção.

## 3. Comandos e resultados NA MAIN

| Comando | Resultado |
|---|---|
| `npm test -- --runInBand` | **258 testes /21 suítes PASS** |
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit -p tsconfig.json` | PASS, incluindo testes |
| `npm run test:e2e -- --runInBand` | **1 teste /1 suíte PASS** |
| `npm run test:sessions` | **97 testes /2 suítes PASS** — 77 regressões +20 cenários #17 |
| `npm run test:abac` | **13 testes /2 suítes PASS** — vínculos/provisionamento |
| `npm run test:security-root` | PASS — AppModule real, login/auditoria/negação tenant/prefixo/envelope/configuração versionada |
| `npm run test:session-admission-operations` | PASS — CLI isolado, sem fallback/contas/políticas/reset/reparo e sem reinicialização insegura |
| `npm run test:audit-operations` | PASS — MongoDB autenticado, ACL/transação/snapshot/retirada do principal legado/exportador somente leitura |
| `git diff --check` e status antes do registro | PASS; main limpa/sincronizada em d86295c |

Logs preservados fora do repositório em `D:\programacao\documentos\evidencias\issue17-main-d86295c\`, arquivos `issue17-main-{unit,build,lint,tsc,e2e,integration,abac,root,cli,acl}.log` e manifesto SHA256SUMS.txt. Saídas são locais: não afirmar CI remoto. Relatório externo completo: `D:\programacao\documentos\ISSUE_17_TICKET_12_2_ACEITE_MAIN.md`.

## 4. O que foi confirmado novamente e por quê

- **Concorrência:** cinco rodadas de 12 logins HTTP, duas aplicações/pools e barreira determinística, mantendo 3 admissões/9 recusas. Configuração, expiração sem TTL, revogação autoritativa e admissão usam o protocolo; A/B/pessoal/outra identidade e legado acima de limite continuam isolados. Não existe contador/slot persistente para divergir.
- **Falhas:** insert real recusado, timeout de lock, conexão de commit derrubada e processo filho morto antes do commit continuam cobertos. Abort não deixa sessão/reserva parcial; resposta perdida/falha pós-commit ainda pode deixar sessão REAL contada, nunca revogada automaticamente.
- **Relógio:** regressão simulada por watermark (sem alterar SO/NTP), leituras snapshot conjuntas e mudança pós-CAS revalidadas. Nenhum token após falha da revalidação; segredo consumido não é restaurado. CAS/replay/expiração absoluta/teto de rotações preservados.
- **Contenção:** lock real no coordenador mantém oito leituras HTTP disponíveis, mas admissões A/B falham fechado até timeout e recuperam após abort. A serialização global permanece risco de disponibilidade entre tenants, não garantia de performance.
- **Rollout/ACL:** retirar roles do principal legado do MONGODB impede novas escritas até em conexão já autenticada; runtime novo restrito, transação/snapshot e exportador seguem operando. Não é alteração de contas da loja nem implementação #19.
- **Regressões:** PBAC/ABAC, vínculos ativos, identidade compartilhada, gestão de sessões/auditoria #5/#6 e configuração #16 permanecem cobertos. Sem bypass de papel/global/ownership, atribuição silenciosa de tenant ou importação de escola.

## 5. Limites preservados e próximo passo

- Implantação NÃO foi feita nem autorizada. Replica set/MongoDB 8, retirada de escritores/identidades antigos, nova identidade restrita e bootstrap ordenado continuam pré-condições operacionais. [Runbook bloqueador](ATOMIC_SESSION_ADMISSION_REVIEW.md#runbook-obrigatório--bloqueador-operacional).
- Não misturar versões, restaurar código antigo automaticamente, zerar sequência, recuar watermark ou apagar regras. Bootstrap da organização antes do coordenador em instalação verdadeiramente vazia; operação real/restore/topologia exigem autorização separada.
- Snapshot não cancela ação já autorizada; clocks/JWT requerem disciplina. Sem 100% de segurança, p95/SLO/HA/failover certificados ou quota pessoal inventada.
- #17 aceita após integração/revalidação; #12 permanece aberta **2/8**. #18 continua **Backlog/NÃO iniciada**, dependente de autorização específica. Nenhum CRUD comercial/CI/infra adicional antecipado.

## Referências

- [Estudo/desenho inicial e histórico](ATOMIC_SESSION_ADMISSION_STUDY.md)
- [Revisão pré-PR: TOCTOU, contenção e rollout](ATOMIC_SESSION_ADMISSION_REVIEW.md)
- [Kanban](../kanban/ABAC_PBAC_SESSIONS.md)
