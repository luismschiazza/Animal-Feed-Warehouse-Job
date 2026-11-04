# Recuperação segura de resposta perdida — PR #29 / issue #18

## Estudo e decisão antes de código

Pesquisa realizada em 2026-11-04, antes da implementação; base examinada `98818e47d517a89ea61719f60882c56f6a6b949c`. Não autoriza merge, deploy ou fechamento. Respostas HTTPS oficiais e datas preservadas fora do Git em `D:/programacao/documentos/issue-18-recuperacao-resposta-pr29/fontes-oficiais/`.

### Fontes oficiais e aplicação (não alegação de conformidade OAuth)

1. [RFC 7636 §§4.1–4.6, 7.1](https://www.rfc-editor.org/rfc/rfc7636.html): segredo aleatório por tentativa, 32 octetos/256 bits, transformação S256, vínculo do challenge à tentativa e comparação antes de entregar tokens. Empregaremos esse **padrão de prova**, não um fluxo OAuth/PKCE completo.
2. [RFC 9700 §§2.2, 4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14): confidencialidade/TLS, vínculo de refresh, rotação e detecção de replay; um resultado incerto não justifica devolver credenciais com base somente num identificador.
3. [OWASP Authentication Cheat Sheet — reauthentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#reauthentication-after-risk-events): exigir credencial atual em operação sensível, erros sem enumeração indevida, TLS, invalidação/rotação após reautenticação.
4. [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): novo identificador de sessão, expiração server-side, proteção dos segredos e registro do ciclo de vida sem tokens em logs.
5. [MongoDB Node driver — transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/): callback pode repetir; gerar credenciais estáveis fora dele, não executar efeitos externos antes do commit; distinguir TransientTransactionError e UnknownTransactionCommitResult. Operações dentro da transação permanecem sequenciais.

## Problema atual

O confirm consome o ticket, revoga a sessão explicitamente escolhida, admite nova família e grava auditoria numa transação #17. Somente depois do commit revalida identidade/contexto/sessão e emite credenciais. Se a resposta se perder, a nova família ocupa capacidade, mas o cliente não recebe os tokens; replay do ticket é corretamente negado. O servidor não consegue provar que a resposta foi recebida.

## Alternativas

| Alternativa | Benefício | Riscos/custo | Decisão |
|---|---|---|---|
| Resultado temporário recuperável, com prova adicional ligada à tentativa | Pode reenviar o mesmo resultado após perda da resposta, sem nova admissão | Requer guardar refresh/access reversíveis ou cifrados, gestão/rotação de chave, janela de exfiltração, concorrência entre entrega original e recuperação; reemitir repetidamente o mesmo bearer amplia replay. Identificador + prova ainda precisariam de política de reautenticação | Não escolhida: infraestrutura atual persiste apenas verificadores, não há cofre/chaves de envelope/protocolo seguro de entrega cacheada |
| Nova autenticação e rotação de refresh mantendo SID | Não armazena credenciais recuperáveis | JWT anterior continua válido no mesmo SID; não invalida completamente o resultado possivelmente roubado | Não escolhida |
| **Nova autenticação + prova privada por tentativa + substituição controlada da família criada** | Sem cache de credenciais; invalida tanto JWT como refresh do resultado anterior; recicla exatamente um slot com o protocolo existente | Mais uma autenticação e uma troca; recuperação de uso único pode também perder resposta; cliente precisa guardar prova em memória e conhecer o prazo | **Escolhida**, com prazo absoluto curto, uso único e fallback explícito |

## Protocolo escolhido e invariantes

1. Antes de `start`, cliente gera **novo verifier de 32 bytes aleatórios**, base64url canônico (43 caracteres); calcula `challenge = base64url(SHA256(ASCII(verifier)))`. Não usar ID de idempotência, SID, senha, timestamp ou RNG fraco como verifier. Só S256; sem `plain`/negociação de algoritmo.
2. `start` aceita `recoveryChallenge` **opcional para compatibilidade**. Se presente, deve ser canônico/32 bytes; o servidor o vincula imutavelmente ao ticket, usuário, organização, membership, aplicação e autenticação por senha. O verifier **não** é enviado no start/confirm. Clientes que oferecem recuperação devem exigir confirmação de disponibilidade; ausência não deve provocar downgrade silencioso.
3. `start` devolve `recovery` com `flow_id` (UUID público, **não** credencial) e `expires_at` quando habilitada. Não devolve senha/verifier/tokens de negócio. O ticket original continua com uso único. Confirm grava o SID admitido no mesmo CAS/transação; nunca guarda o par de tokens em claro/cifra recuperável.
4. Após resultado incerto, cliente reobtém a senha sem persistir/automatizar sua retenção. POST `/api/auth/session-replacement/recover`: `{email,password,organizationId,flowId,recoveryVerifier}`. LocalAuthGuard exige senha atual; serviço exige sua proveniência server-only, prova S256 e contexto exato. UUID, challenge público, JWT, refresh ou ticket sr1 isolados nunca autorizam recuperação.
5. Pré-filtro rejeita prova inválida/desconhecida/expirada/consumida antes de escrever no fence. **Não é autorização**: todos os predicados, prazo, estado, senha atual, conta, organização, membership original e roles são relidos no snapshot fenced.
6. Se confirm ainda não comitou (ticket pending), recuperação autenticada/provada retorna **409 sem credenciais/efeitos**. O cliente pode aguardar e consultar recuperando novamente; ou repetir confirm da mesma seleção enquanto ainda válido. Desconexão HTTP não prova aborto: o request original pode continuar no servidor. Se confirm falhar/abortar, sessão antiga permanece; se comitar, recuperação posterior observa consumed.
7. Se consumed, recuperar invalida **somente o SID exato criado por essa tentativa**, nunca a seleção original nem uma sessão arbitrária. Em uma transação: CAS consumed→recovered, regra append-only específica de recuperação, contagem de capacidade atual, nova família/SID, receipt e auditoria. Mesma serialização/snapshot-majority/relógio Mongo de #17; credenciais novas geradas fora do callback. Não duplicar sessão nem reativar a antiga.
8. Excesso após redução de limite nega 409 sem revogar nada. Família criada já expirada/revogada nega sem substituição automática; usar login/novo fluxo explícito. A nova família conserva a expiração absoluta da família substituída, sem estender seu prazo por recuperação.
9. Recuperação é **de uso único**, não endpoint de retransmissão de credenciais. Duplicatas/concorrência têm no máximo um vencedor. Original sr1 permanece consumido. Resultado anterior, inclusive JWT que porventura chegou ao cliente/atacante, passa a ser inválido; uma operação já autorizada por snapshot não é cancelada retroativamente.
10. **Prazo: os mesmos 2 minutos absolutos desde start**, sem renovação por confirm/recover/retry. TTL é limpeza, nunca autorização. Confirm próximo do vencimento deixa pouco tempo de recuperação: cliente deve explicar isso e preferir reiniciar antes da seleção quando o prazo não for suficiente. Após expiração, consumir recuperação, perder verifier ou perder também a resposta de recover: descartar provas; login normal se houver vaga, senão novo start com senha/prova nova e seleção explícita (inclusive da família órfã). Nada é revogado automaticamente por timeout. Não há recuperação indefinida por UUID.
11. Auditoria correlaciona flowId público/requestId, revogação e nova família com evento próprio de recuperação; falha antes do commit faz rollback total. Falha após commit nunca entrega credenciais por suposição nem restaura sessões. Erros de prova desconhecida não atribuem usuário/tenant não verificados.

## Cliente e proteção

Exigir TLS verificado em toda a cadeia; nunca enviar senha/verifier/tokens em URL, query, logs, analytics ou erro. Manter verifier e ticket em memória durante a tentativa, não localStorage/sessionStorage; não guardar senha para retry. Serializar as ações do cliente; ao iniciar recuperação, incrementar a geração local da ação e ignorar qualquer resposta tardia de confirm (pode conter um par já invalidado). Após recuperação bem-sucedida descartar ambos e qualquer credencial anterior, instalar só o novo par. Não executar recuperação automática após resposta confirmada: ela **invalida explicitamente o resultado anterior** mesmo que tenha sido utilizado. Não inferir recebimento pela auditoria allowed ou por HTTP finish. ID da tentativa serve somente para correlação.

A prova não é MFA nem DPoP: XSS/dispositivo comprometido pode roubar memória e senha. TLS, higiene do cliente, controles de abuso distribuídos (#20), governança/PKI/NTP e limites de contenção do fence continuam necessários. Roubo de UUID/challenge/sr1 sozinho não basta; senha + verifier roubados comprometem a tentativa dentro do prazo. Senha alterada/membership recriada invalidam a tentativa; utilizar novo fluxo com a identidade atual.

## Plano de testes antes de implementação

- Unitários: S256 canônico/256 bits, formatos inválidos, separação de credenciais e redaction.
- HTTP/Mongo real: perda antes do commit com rollback e com operação ainda em execução; perda real de socket depois do commit; recuperação original/segunda resposta perdida; repetição do original/recover.
- Duas instâncias/pools, barreiras confirm–recover e recover–recover; um vencedor, capacidade preservada; conexão de commit perdida e validators reais em cada fase para provar rollback.
- Sem senha correta/proveniência ou sem verifier, só UUID/challenge/sr1/JWT/refresh, prova de outra tentativa, IDs de terceiros, A/B/pessoal/app; expiração com TTL desligado e após pré-filtro; conta/organização/membership/password/roles atuais; limite reduzido e família revogada/expirada.
- Segredos ausentes em logs/auditoria/respostas negativas/document serialization; correlação e permissões append-only preservadas; CLI/ACL smoke sem nova permissão de runtime.
- Regressão integral e CI do novo head antes de apresentar como aprovado. Nenhuma mudança de lock/engines/overrides/S1, budgets ou assertions/failpoints para obter verde.

## Exemplo de prova no cliente (Web Crypto, sem biblioteca nova)

```ts
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = b64url(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
));
// start: enviar somente recoveryChallenge: challenge com as credenciais de login.
// Guardar verifier apenas na memória da tentativa, junto do flow_id e expires_at recebidos.
// recover: pedir senha atual novamente e enviar flowId + recoveryVerifier: verifier.
```

Exemplo é a geração da prova, **não** um SDK/UI implantado. Verificar availability de Web Crypto/TLS, lidar com descarte de memória/navegação e não registrar variáveis. A data do cliente serve só para UX; servidor decide expiração no snapshot. Operação autorizada antes do vencimento pode terminar depois dele; não é deadline de entrega HTTP.

## Resultados locais e limites da evidência

- 283 unitários/26 suítes (inclui vetor oficial da RFC 7636 e metadata da quinta rota); 160 HTTP/MongoDB/3 suítes (128 anteriores +32 novos); 13 ABAC/2 suítes; 4 E2E/2 suítes. Types, lint qualificado, Babel coverage, assets dist-only e AppModule/CLI smoke aprovados.
- Smoke autenticado com role mínimo executou start/confirm/recover reais, invalidou JWT/refresh do resultado anterior, preservou contagem 3, negou replay, DDL e update/delete de journals; inicializadores fonte/compilado sem alteração de privilégios ou índices. Nova recuperação não requer migração de índice/TTL; tickets antigos sem challenge não são recuperáveis. Validador customizado de operador com enum de estados/actions deve ser revisado pelo operador, nunca reparado em runtime.
- Testes novos cobrem sockets reais perdidos antes de rejeição transacional e após commit de confirm/recover; disputa entre pools recover–recover e confirm–recover; expiração após pré-filtro com TTL desligado; cinco rejeições reais de validators e falhas pós-commit de clock/conta/membership/login-audit; IDs/provas estrangeiros e fallback explícito.
- No race confirm–recover, ambas as transações podem vencer **em sequência**: uma admite o resultado original e outra o invalida e substitui; nunca são duas famílias extras ativas. Se recover linearizar antes, retorna 409 sem efeito. Par tardio de confirm pode já ser inválido e deve ser ignorado pelo cliente.
- Failpoint de queda de conexão Mongo atua antes da execução de commit; demonstra retry sem duplicação nesse evento, **não** todos os resultados possíveis de commit incerto. Perda de HTTP **após** commit é prova separada, com evento close observado no servidor antes de continuar emissão/resposta.
- Falhas preservadas: extrator Python indisponível (usado Node sem instalação); cinco erros de formatting de chain prettier (extraído objeto de fixture, sem mudar assertions/failpoint); ABAC inicialmente sem ABAC_TEST_MONGO_URL e comando de assets inexistente. Corrigidos somente invocação/fixture e reexecutados com labels novos; saídas anteriores preservadas.
- Nenhum package/lock/engine/override/script S1 foi alterado; nenhuma quota, assertion, failpoint ou timeout foi relaxado. A diretriz permanente de consultar fontes/comparar alternativas/testar riscos foi registrada no AGENTS do projeto e no bloco Animal Feed Warehouse de `D:/programacao/AGENTS.md`.
- CI remoto do novo head deve ser consultado na PR #29/evidência externa; o sucesso histórico de 98818e4 **não** qualifica esta extensão. Nenhum merge, deploy, aceite na main ou encerramento. Evidências desta rodada em `D:/programacao/documentos/issue-18-recuperacao-resposta-pr29/`; estudo pré-código preservado byte-exatamente em `DESENHO_ANTES_DO_CODIGO.md`.

Este desenho foi registrado antes das alterações de implementação; esta seção foi completada após os testes locais, antes da publicação do novo head.
