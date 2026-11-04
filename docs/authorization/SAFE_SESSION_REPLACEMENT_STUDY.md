# #18 — Substituição explícita de sessões (proposta implementada para revisão)

> Extensões posteriores: [primeira recuperação após 98818e4](SESSION_REPLACEMENT_RECOVERY_STUDY.md) e [recuperações sucessivas v2 após cf92402](SESSION_REPLACEMENT_REPEATED_RECOVERY_STUDY.md). O protocolo atual exige reautenticação por senha e a prova privada em cada operação, deduplica seu ID e troca somente a família atual, com orçamento 16 e prazo original. Os resultados 280/128 abaixo são históricos da entrega original; a extensão tem testes/CI próprios. Não reenviamos tokens armazenados nem reutilizamos o ticket consumido.

## Autorização e base

Execução autorizada pelo proprietário: implementar/testar com banco descartável e preparar PR para revisão. **Não fazer merge, deploy ou encerrar #18.** Base conferida na main remota após PR #27: `e285965985bd5ab1f8d45227ada3d654a7995caa`. Branch isolada `feat/issue-18-safe-session-replacement`, em `D:/programacao/projetos/Animal-Feed-Warehouse-issue-18`. Evidências novas em `D:/programacao/documentos/issue-18-substituicao-sessoes`. Não reutilizar/reescrever relatórios selados da #27. A exceção temporária S1 e o acompanhamento #28 não são correção upstream nem autorização operacional.

## Problema, alternativas e decisão ANTES do código

O login empresarial atual recebe 409 quando alcança a quota. Excluir a sessão mais antiga automaticamente ou revogar primeiro e admitir em outra operação abre perda de sessão/corridas. Reutilizar JWT empresarial como autorização pré-admissão daria privilégios indevidos. JWT temporário autossuficiente, contador em memória ou TTL de MongoDB como autorização não asseguram consumo único entre instâncias.

Escolha: manter o contrato existente de `/auth/login` (409 sem credenciais no limite) e oferecer fluxo explícito separado com senha novamente comprovada: `POST /auth/session-replacement/start`. O retorno não é uma sessão/JWT. Um segredo opaco aleatório de 256 bits, com prefixo/audiência próprios, autoriza somente listar sessões próprias do contexto fixado, confirmar uma seleção explícita ou cancelar. Duração máxima: **2 minutos**, nunca renovada pelo uso. Estado e verificador, não o segredo, ficam em MongoDB.

### Identidade e contexto

- O start exige o mesmo LocalAuthGuard e senha do login. A prova interna da autenticação associa objeto retornado, ID e hash da credencial vigente; não pode ser reconstruída de userId fornecido pelo cliente. A autorização persistida vincula usuário, organização, vínculo, aplicação fixa e fluxo aleatório. Conta/organização/vínculo/credencial são revalidados nas operações; mudança/recriação do vínculo invalida o fluxo. Roles são relidas, nunca aceitas do cliente.
- Nenhum DTO de continuação aceita userId, organizationId, aplicação, roles ou metadados de autoridade. Somente autorização temporária e, na confirmação, SID explícito. O serviço filtra usuário **e** organização, além de regras de revogação/validade; não depende só da validação HTTP.
- Contexto pessoal não tem quota empresarial definida na fundação #17: start pessoal é negado sem inventar limite nem fallback de tenant. Sessões pessoais/de B/de outra identidade nunca são candidatas de A.
- Listagem paginada/bounded de metadados positivos: SID, datas e indicação limitada de dispositivo; sem refresh/verificadores/segredo/IP ou outros dados de conta. A autorização não dá acesso à listagem administrativa, negócio, refresh, troca de tenant ou alteração de limite.

### Protocolo atômico

Todas as mutações do fluxo usam `SessionSerializationService.run`, replica set, transação snapshot/majority e relógio MongoDB da #17. Sem mutex local, fallback standalone, contador aproximado, redução de timeout/quota ou mudanças de autorização. A coleção de tickets exige DDL explícito do operador; ausência/índices impróprios bloqueiam SOMENTE o novo fluxo, sem DDL silencioso pela runtime.

- Start: comprovar contexto/senha e quota atingida, marcar como expirado apenas o fluxo pendente já vencido daquele escopo, criar ticket pendente com expiração e auditoria na mesma transação. No máximo um fluxo pendente por usuário/organização/aplicação; start duplicado é negado, não expõe ticket existente nem encerra sessões.
- Listar: validar ticket pendente/hash/audiência/expiração **pelo relógio do servidor**, revalidar identidade e retornar apenas sessões elegíveis daquele dono/tenant. TTL é exclusivamente limpeza.
- Confirmar: sob o mesmo fence, reler ticket/contexto e limite atual; validar SID próprio, mesmo tenant, ativo e não revogado; verificar capacidade; consumir por CAS; registrar seleção, regra append-only da sessão escolhida, nova sessão com versão/sequence e resultado/auditoria **na mesma transação**. Só depois de commit confirmado e revalidação da sessão/identidade emitir credenciais normais. Duas confirmações não podem vencer.
- Redução de limite: a seleção é de **uma** sessão. Se o número ativo atual ainda é maior que o limite, negar sem revogar nenhuma. Não há exclusão silenciosa de várias sessões. O usuário pode usar gestão já autorizada em outra sessão para resolver excesso ou aguardar decisão administrativa.
- Cancelar: consumir como cancelado e auditar atomicamente; não revogar/criar sessão. Cancelamento e confirmação concorrentes têm um só vencedor. Ticket expirado/cancelado/consumido/replay não produz nova sessão/revogação.

### Falhas e limites deliberados

Falha antes do commit aborta consumo/regra/nova sessão/auditoria de sucesso; sessões antigas permanecem. Resultado de commit incerto, perda da resposta, falha de assinatura ou de auditoria pós-commit **não autoriza devolver credenciais por suposição nem reviver sessão revogada**. Após commit confirmado, efeitos podem existir mesmo sem resposta; ticket é de uso único, não um mecanismo de recuperação/reemissão de segredos. Na versão original, recuperar por novo login/gestão, não repetir consumo ou gravar tokens em claro. A extensão posterior oferece `recover` com senha atual e verifier S256 vinculado antes de start, invalidando somente o resultado anterior da tentativa e criando outra família em uma transação, sem cache de credenciais; prazo e fallback no estudo vinculado acima.

A prova de autorização tem os limites de snapshot da fundação: não cancela operação já autorizada se uma conta/vínculo mudar depois daquele ponto. Revalidação após commit reforça negação de credenciais. Fence global mantém risco de contenção intertenant; endpoints temporários também têm throttling, sem afirmar rate limit distribuído/SLO (#20/#14). Sem HA/rollout/PKI/NTP/backups certificados.

Auditoria allowlist registra início/listagem/seleção/cancelamento/resultado e negação/erro, correlacionados por requestId, replacementFlowId (UUID público, não o segredo), usuário/contexto e nova sessão quando aplicável; regra append-only liga SID escolhido ao novo SID. Nunca espalhar DTO/ticket/erro no journal, logs ou respostas. O SID alvo não deve vazar no stream de outro tenant. Não há política de encerrar a sessão mais antiga.

## Testes e operação planejados (não resultados)

HTTP/MongoDB real descartável, dois apps/pools: start no limite sem sessão normal; seleção/cancelamento/expiração independente do TTL/replay; IDs estrangeiros A/B/pessoal/usuário; campos adulterados e audiência; senha/vínculo/organização suspensos; duas confirmações e cancelamento concorrentes; falhas entre consumo/regra/inserção/auditoria, limite reduzido, relógio inválido/regredido e indisponibilidade; ticket recusado nas rotas normais; ausência de segredos nos journals/logs e respostas negativas. Reexecutar regressões #16/#17, unitários/E2E/ABAC, lint/types/build e política de auditoria sem alterar fingerprints/expiração S1.

Este planejamento foi registrado antes da implementação; resultados reais seguem abaixo. Nenhuma execução contra MONGO_URL da aplicação ou dados reais. Não há aceite na main, merge, deploy ou encerramento autorizado.

## Contrato implementado e arquivos

Todos os endpoints são POST sob `/api/auth/session-replacement`. Na aplicação completa, o envelope global existente envolve os dados; testes focados sem interceptor verificam o objeto de domínio.

| Rota       | Body                                           | Efeito                                                                                     |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `start`    | email, password, organizationId explícito      | 201 com replacement_required, replacement_token, expires_at; sem access/refresh/session_id |
| `sessions` | replacementToken, before? (ObjectId)           | 200 com até 25 items e nextCursor; somente SID/datas/device limitado a 80 caracteres       |
| `confirm`  | replacementToken, sessionId UUIDv4 selecionado | 200 com par normal somente após commit/revalidação/auditoria                               |
| `cancel`   | replacementToken                               | 200 cancelled=true; nenhuma revogação/admissão                                             |

Campos extras de autoridade e query são recusados. Tenant/aplicação não vêm de headers. Token desconhecido, malformado, expirado ou já encerrado é pré-filtrado sem escrever o fence global; esse pré-filtro **não autoriza**: todas as verificações se repetem na transação. Uma autorização válida ainda sofre o risco de contenção global e throttling local, sem garantia distribuída.

- `tokens/session-replacement-token.ts`: segredo aleatório de 32 bytes, prefixo sr1, codificação canônica e verificador SHA-256 separado por audiência/aplicação. Não é JWT nem refresh.
- `schemas/session-replacement.schema.ts`: coleção efêmera, contexto imutável, hash do segredo e prova da credencial com select:false/redação; índice único parcial de pendente e único TTL de limpeza. Verificador de índices antes das operações; runtime não repara índices.
- `services/auth.service.ts`: prova de senha **Symbol privado não enumerável** no objeto produzido pelo Passport. Não há segredo adicional serializado, cache de admissão ou mutex por processo. Continuação usa somente estado persistido, funcionando em outra instância. Conta/credencial e vínculo são relidos no snapshot fornecido; depois do commit são relidos novamente antes dos tokens.
- `services/session-replacement.service.ts`: participantes do protocolo #17, limite atual e contagens bounded (`limit+1` para detectar excesso), seleção exata, CAS do ticket, rule append-only, nova família e auditoria na mesma transação. A contagem preserva elegibilidade da #17, inclusive não ignorando silenciosamente linhas legadas só porque seus metadados estão impróprios.
- `services/session-revocations.service.ts` / schema: ação específica replace_session, ator dono e mesmo tenant; novo SID do resultado liga o ator comprovado por senha à sessão escolhida no mesmo commit. Não abre transação aninhada e não transforma journal em update/delete.
- Model/module/DTO/controller/metadata coverage: quatro exceções públicas **específicas**, protegidas por senha/capability no serviço; nenhuma nova exceção de negócio/PBAC. Leitores de usuário/vínculo aceitam sessão transacional opcional, sem alterar os consumidores anteriores.
- `common/audit`: eventos do fluxo e campo allowlisted replacementFlowId; rastreia início até cancelamento/confirmação sem gravar token/hash/prova. Audit stream continua filtrado antes da paginação.
- `test/session-replacement.integration-spec.ts`, testes de token/proveniência e `session-replacement-operations.smoke.ts`: verificação real incremental. Configuração `test:sessions` inclui a nova suíte. CI chama o novo smoke autenticado além do anterior, sem mudar pins, permissões GitHub, assertivas ou timeouts.

Conceito TypeScript/NestJS/MongoDB utilizado: `@Public()` significa dispensar JWT **somente nessa rota**, não autorizar a ação; a capability é validada no serviço. `ClientSession` mantém reads de conta/vínculo/política e writes de consumo/regra/admissão no mesmo snapshot. O CAS `state: pending -> consumed` e o fence compartilhado, não o TTL nem um Set local, impedem duas admissões. `select:false` não protege aggregate: projeções/mappers são positivos e não leem verificador de refresh para a listagem.

## Operação deliberada (não executar no banco real nesta tarefa)

Após as pré-condições de #16/#17, com backup/plano/identidades e replica set aprovados, operador provisiona SOMENTE a coleção/índices:

```text
SESSION_REPLACEMENT_MONGO_URL=<URI operacional explícita> npm run session-replacement:initialize
# Alternativa compilada com a mesma variável:
node dist/commands/initialize-session-replacement.script.js
```

Sem dotenv, fallback MONGO_URL, seed, conta, ticket pré-criado ou reset de sequência. Reexecução compatível é idempotente; índice conflitante/inseguro falha sem drop/reparo automático. Metadados ausentes bloqueiam o novo fluxo com 503; login normal não depende desta coleção. O smoke testa as duas formas executáveis e ausência da variável.

Runtime: find/insert/update/listIndexes **somente** em session_replacement_challenges; sem remove/createIndex/createCollection/drop/collMod. TTL atua pelo servidor. Auth sessions mantêm seus poderes anteriores de CAS; coordenador find/update/listIndexes; journals seguem find/insert/listIndexes, sem TTL/update/delete. Leitura de usuário/organização/vínculo para autenticação não ganha permissão de alteração. Não conceder readWrite/dbOwner/root ou roles aditivas que anulem isso.

Apenas um fluxo pendente por dono/tenant/aplicação: se a resposta do start se perder, não recuperar/expor o segredo do banco; aguardar 2 minutos ou cancelar com o token já recebido. Em excesso após redução, negar uma seleção insuficiente sem encerrar múltiplas sessões. Em resposta perdida pós-commit, clientes que habilitaram `recoveryChallenge` podem usar a recuperação de uso único descrita no estudo posterior, ainda nos dois minutos originais. Sem prova, após expiração ou após consumir recuperação, consultar/gerir por sessão já autorizada ou novo login/fluxo explícito; não repetir tickets consumidos nem reemitir segredos por suposição. Sem UI/cliente single-flight/distribuição de rate limit nesta entrega; integração de cliente deve oferecer seleção e confirmação visíveis, escapar device e nunca incluir tokens em URLs/logs de body/resposta/proxy/APM.

## Resultados locais verificados em 04/11/2026 (na branch)

| Comando/verificação                                                       | Resultado                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| npm ci / npm ls --all                                                     | exits 0; lock/dependências/overrides/engines inalterados                                                                              |
| npm test -- --runInBand                                                   | **280 testes / 25 suítes** (266 anteriores + 14 novos)                                                                                |
| npm run test:sessions                                                     | **128 testes / 3 suítes** (97 anteriores + 31 novos HTTP/MongoDB)                                                                     |
| npm run test:abac                                                         | **13 testes / 2 suítes**                                                                                                              |
| npm run test:e2e -- --runInBand                                           | **4 testes / 2 suítes**                                                                                                               |
| npm run test:security-root                                                | PASS AppModule real                                                                                                                   |
| npm run test:session-admission-operations                                 | PASS regressão CLI #17                                                                                                                |
| npm run test:audit-operations                                             | PASS autenticado, retirada de escritor legado/exportador preservados                                                                  |
| npm run test:session-replacement-operations                               | PASS HTTP CUSTOMER com runtime restrito, transação, DDL negado e CLI source/compiled                                                  |
| npm run lint / tsc --noEmit -p tsconfig.json / npm run build / diff check | exits 0                                                                                                                               |
| Testes de política de auditoria                                           | **110 PASS**, sem alterar perfil S1                                                                                                   |
| Audits npm atuais                                                         | produção **0/exit0**; completo **6 LOW/exit1**, preservados brutos                                                                    |
| Fontes oficiais e gate S1 atuais                                          | captura 2026-11-04T14:22:55.755Z; gate 0, reviewed-cve-rejected-feed-discrepancy; prazo original **10/11/2026 22:09:20.702Z** mantido |

Concorrência: duas aplicações Nest/pools distintos, barreira antes do escritor; confirm/confirm e confirm/cancel têm um vencedor e nenhum slot adicional. Isolamento cobre outro dono/A/B/pessoal, contexto/audiência adulterados, corpo de autoridade, token como JWT/refresh e chamadas diretas. Senha/conta/organização/vínculo/recriação/roles são relidos. Expiração é provada com documento ainda presente e TTL desligado. Limite reduzido é negado sem múltiplas revogações; após gestão explícita, admite usando a versão atual. SID expirado não é substituído por fallback.

Falhas intermediárias usam **validadores MongoDB reais** nos estágios consumo, seleção/auditoria, regra, insert e resultado/auditoria; todos abortam consumo/regra/família/sucesso, permitindo retry ainda válido. Falha pós-commit, falha real de login-audit, regressão do watermark ou suspensão de conta/vínculo após commit não devolvem credenciais nem ressuscitam a sessão substituída. Logs console observados, journals e respostas negativas foram inspecionados automaticamente por ausência dos segredos de teste; isso não certifica configuração de proxy/APM de produção.

Ambiente: Node24.22.1/npm11.21.1, MongoDB descartável local `mongo:8`, replica sets novos e bancos UUID descartados pelos testes; não se usou MONGO_URL real. Test budget da regressão #17 requer transactionLifetimeLimitSeconds=5, como o CI existente; nenhum timeout/assert/failpoint/quota de aplicação foi enfraquecido. Replica set de um nó e dois apps no mesmo host não certificam HA, eleição, multi-host ou throughput.

### Tentativas falhas preservadas

- Primeira tipagem: String.at incompatível com lib TS existente e \_id de coleção MongoDB tipado como ObjectId em fixture. Corrigidos teste/typing, sem mudar TS/lib ou asserts.
- Primeiro HTTP: WeakMap por AuthService não compartilhava prova quando Passport global das duas aplicações usava a outra instância DI. Todos os starts negavam 401; corrigido para provenance Symbol privado não enumerável no objeto autenticado. Não se removeu a exigência de senha/prova.
- Primeira regressão completa usou budget de transação padrão de 60s no servidor descartável; teste do processo morto da #17 esperava o fixture de 5s e falhou, com contenção nos seguintes. Reconfigurado SOMENTE o servidor de teste para o parâmetro já existente no CI, sem editar os testes; rodada completa repetida e aprovada.
- Primeiro AppModule smoke foi chamado sem variável explícita e recusou executar; repetido com URI descartável explícita, aprovado.
- Lint detectou formatação não estável de chain longa no fixture novo; extraído objeto de fixture sem alterar asserts ou formatter/rules. Lint/types e toda a rodada final passaram.
- Primeira execução remota [41849119457](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/actions/runs/41849119457), head fa5f61c: quality e 128 HTTP/MongoDB/ABAC/AppModule/CLI passaram, mas novo smoke autenticado falhou; mTLS foi pulado, portanto **não houve CI completo aprovado nessa rodada**. O contêiner autenticado é uma instância development nova, sem compartilhar dist dos outros jobs/contêineres; o teste local tinha dist pré-compilado. Probe isolado confirmou dist ausente em development. Corrigido o pré-requisito no próprio smoke: compilar checkout atual, verificar presença do CLI e registrar somente fase/boolean de diagnóstico seguro. Não se pulou CLI compilado, não se compartilhou artefato obsoleto e não se mudou assertiva/timeout/ACL/protocolo da aplicação. Nova rodada remota será indispensável; falha e artifacts anteriores preservados.

## Revisão e limites restantes

Implementação proposta, **não integrada/aceita na main**. PR para revisão e CI remoto próprios devem ser identificados no corpo da PR/evidência externa; não reutilizar verde da #27 como teste desta branch. #18 e #12 continuam abertas/2 de 8 integradas, sem referência de fechamento automático. #19–#23 não foram antecipadas.

Preservados os limites de snapshot, commit incerto e contenção; não há garantia exactly-once de resposta, disponibilidade distribuída, UI, monitoramento automático ou autorização de produção. S1 não foi renovada/expandida: seis achados dev continuam reais no feed npm e #28 permanece aberta. Revisão S1 antes de **10/11/2026 19h09 Brasília**; mudança de evidência/expiração deve bloquear o gate, não ser contornada. Nenhum merge, deploy, real DB/conta/seed/email, alteração global TEMP/TMP ou exclusão de worktree/histórico.
