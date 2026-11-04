# PR #29 — recuperações sucessivas dentro da tentativa

## Pesquisa e decisão ANTES de implementar

Base inspecionada: `cf9240206bc7fb3b0105c5cdee578f6a82f8edca`; PR aberta, main e285965. Pedido: permitir recuperar novamente após perder inclusive a resposta de recover, mantendo senha atual + prova privada em cada operação. Não autoriza merge/deploy/encerramento.

Nova consulta oficial em 2026-11-04, corpos HTTPS/status/datas em `D:/programacao/documentos/issue-18-recuperacoes-sucessivas-pr29/fontes-oficiais/`:

- [RFC 7636 §§4.1–4.6/7.1](https://www.rfc-editor.org/rfc/rfc7636.html): verifier aleatório/256 bits e challenge S256 vinculado à tentativa. Reutilizamos a técnica, **não** o contrato de authorization code de uso único de OAuth/PKCE.
- [RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14): confidencialidade/TLS, detecção de replay e invalidação de credenciais anteriores. Esta recuperação tem autenticação por senha e não substitui nem relaxa a rotação/replay do endpoint refresh existente.
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#reauthentication-after-risk-events) e [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): reautenticação sensível, renovação/invalidação de SID, prazo server-side e auditoria sem credenciais.
- [MongoDB Node driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/): retries de callback/commit, efeitos dentro da transação e credenciais estáveis fora do callback, sem paralelismo de comandos no mesmo ClientSession.

## Comparação

| Alternativa | Segurança e falhas | Adequação |
|---|---|---|
| Uso único atual + iniciar outro fluxo | Menor exposição da prova; após resposta de recover perdida obriga nova seleção manual | Seguro, mas não atende recuperação sucessiva solicitada |
| Cache do resultado com prova/senha | Retransmite mesmo par, mas introduz segredos reversíveis/cofre/chaves e corrida de entrega | Não escolhido; sistema armazena somente verificadores |
| Rotacionar verifier em cada recover com próximo challenge pré-gerado no cliente | Limita uso de prova antiga após vitória legítima; em resposta perdida cliente precisa resolver qual prova/geração comitou, guardar pares anterior/próximo e lidar com corrida/roubo da continuidade | Possível evolução; maior estado/complexidade de sincronização e cliente. Não elimina ataque se senha e prova vigente forem roubadas antes do commit |
| Reutilizar prova da tentativa, **nova senha em cada chamada**, substituir sempre o SID atual e deduplicar cada intenção no Mongo | Simples após perdas sucessivas/reinício; sem cache de tokens. A prova permanece válida para novas intenções até expiração; exige limitar a janela/orçamento e reconhecer o risco de roubo conjunto | **Escolhida**, com prazo original inalterado, até 16 recuperações e request ID de uso único por intenção |

A escolha não torna uma prova reutilizável equivalente a uma prova de uso único. É uma capacidade temporária de continuidade, sempre combinada com senha atual, contexto e estado persistido. Dezesseis operações por tentativa é **novo orçamento defensivo**, não aumento da quota de sessões, não extensão de prazo e não rate limit global/distribuído. Throttling existente também pode limitar o número de chamadas antes do prazo; 16 é teto, não promessa de disponibilidade de todas elas. Não será elevado para fazer testes passarem.

## Protocolo v2

1. Cliente gera verifier privado de 32 bytes e challenge S256 antes de start, como antes. Start informa `recovery.protocol: 2`, `max_recoveries: 16`, flow_id e expires_at. Cliente exige suporte explícito, sem downgrade.
2. Toda chamada recover exige LocalAuthGuard com senha atual, verifier, flowId, organização e **`recoveryRequestId` UUIDv4** novo por intenção. Request ID é público/deduplicador, **não** autenticação/segredo. Não substituir senha por JWT, login anterior ou idempotency ID.
3. Cliente mantém o mesmo request ID ao repetir uma intenção de resultado incerto. Se o commit anterior abortou, o mesmo ID ainda pode ser aplicado. Se comitou, mesmo ID recebe 409 `recovery_already_applied`, sem tokens nem nova troca. Para obter acesso depois de perder a resposta, pedir senha novamente e iniciar **outra intenção explícita com novo ID**, mesma prova privada, ainda dentro do prazo.
4. Ticket guarda `recoveryVersion` e conjunto limitado `recoveryRequestIds`; ambos persistidos no Mongo. Versão 0/consumed aponta para admittedSessionId; versão >=1/recovered aponta **somente para recoveredSessionId atual**. Não voltar ao primeiro SID nem escolher uma família arbitrária. Estado/counter/lista/pointer inconsistentes falham fechados; tickets antigos sem metadata v2 não são promovidos silenciosamente.
5. Sob o fence/snapshot-majority/relógio #17: repetir prova/contexto/senha/membership original/TTL/estado, negar request ID já aplicado, conferir orçamento e SID atual ativo do mesmo usuário/tenant/aplicação, conferir quota vigente, CAS versão+pointer+ID ausente, incrementar versão/registrar ID/mover pointer, anexar revogação do SID atual, recontar, inserir uma família e auditoria correlacionada. Tudo em **uma transação**, sem cache de slots nem mutex local.
6. Credenciais estáveis fora do callback; só saem após commit e revalidação de conta/contexto/sessão/auditoria. Não guardar tokens em claro ou cifra recuperável. A nova família conserva o expiresAt absoluto da anterior. Sr1 original continua consumido; refresh antigo não passa a funcionar.
7. Mesmo ID concorrente: no máximo uma troca. IDs distintos podem linearizar várias trocas sequenciais: só a última família fica ativa, nunca uma adicional por chamada. Resposta de uma geração anterior pode já estar inválida ou falhar na revalidação pós-commit. Cliente single-flight usa request ID/geração local e versão recebida para ignorar respostas tardias.
8. Logout/revogação/expiração do **SID atual** bloqueia novas recuperações: não restaurar famílias anteriores nem contrariar revogação. Limite reduzido com excesso nega sem multi-evicção. Mudança de senha/conta/organização/membership invalida o fluxo; roles atuais são relidas.
9. Prazo permanece **dois minutos absolutos desde start**, sem renovação por chamadas, versão, processo ou retry. TTL é só limpeza. A expiração é decidida no snapshot; não é promessa de cancelar operação já autorizada ou de entregar HTTP antes de certo instante. Após vencer, consumir orçamento, perder verifier ou metadata inválida: login se houver vaga, senão novo start e seleção explícita. Nenhuma sessão é revogada automaticamente por timeout.
10. Auditoria allowed por operação registra flowId, requestId HTTP, recoveryRequestId e versão resultante, além da regra SID anterior→novo. Repetição gera denied sem segunda admissão. IDs de operação não são prova de entrega ao cliente. IDs/versão são allowlisted, nunca verifier/senha/tokens/challenge.

## Roubo, replay e limites explícitos

- Roubo de UUID de tentativa/operação, challenge público, sr1 ou verifier **sem senha** não autoriza recover. Senha **sem verifier** também não recupera essa tentativa (embora senha comprometida já ameace o login normal).
- **Senha + verifier vigente roubados** permitem que atacante gere novos IDs, rotacione a família da tentativa, obtenha credenciais e invalide a do usuário até prazo/orçamento. Deduplicar ID não distingue quem é legítimo, não impede novas intenções maliciosas e não é MFA/DPoP. Uma corrida pode ser vencida pelo atacante. Não prometer resistência à captura completa de uma requisição autenticada.
- Mesmo payload/request ID reaplicado não deve produzir outro efeito nem retransmitir credenciais. Novo ID com todos os fatores é uma nova autorização, não um replay que se consegue detectar criptograficamente como ilegítimo neste desenho.
- Mitigações: TLS verificado; verifier em memória por tentativa, senha solicitada novamente sem persistir payloads; nenhum body sensível em logs/APM/proxy; prazo fixo curto/orçamento atômico; revogação da família atual ou mudança de senha bloqueia continuidade. Quem controla senha e cliente exige resposta a comprometimento de conta; proteção distribuída de abuso/MFA/gestão de incidente ficam fora desta entrega (#20 e dependências operacionais). Novo fluxo não herda orçamento, portanto limite por tentativa não protege sozinho contra abuso global.
- Restart do backend não deve apagar dedup/counter/pointer nem renovar prazo. Reinício do cliente que perde o verifier privado **não** autoriza recuperar por UUID; usar fluxo explícito novo. Frota mista pode não entender o protocolo/metadata: falhar fechada, sem certificar rollout.

## Plano de testes registrado antes de código

Múltiplos sockets perdidos após confirm e recuperações consecutivas; mesmo/distintos IDs em duas instâncias; queda real de processo depois do commit e reinício em outro PID; expiração após várias gerações e após pré-filtro, TTL desligado; logout/revogação/expiração da família atual; quota reduzida/owner/A-B/pessoal/app; roubo de fatores individuais e demonstração limitada do compromisso conjunto; orçamento 16+1; validators reais nas cinco fases inclusive após a primeira recuperação e retry com mesmo ID; postcommit failure, auditoria por versão/operação, ausência de segredos; regressão/ACL/CLI/CI novo sem relaxar testes/limites/timeout/policy S1.

## Resultados

Resultados locais antes da publicação: **283 unitários/26 suítes, 181 HTTP/MongoDB/3 suítes (160 anteriores +21 novos), 13 ABAC/2 suítes, 4 E2E/2 suítes**; types/lint/build/coverage Babel/assets/AppModule/ACL/CLI aprovados. Smoke autenticado conservou permissões sem DDL/delete nos challenges ou update/delete/TTL nos journals, executando duas gerações e dedup de ID real. Nenhum pacote/lock/engine/override/script S1 foi alterado.

Os 21 novos casos incluem três recuperações consecutivas com sockets realmente perdidos, mesma/distintas intenções entre dois pools, disputa na fronteira 15→16, cinco validators reais de rollback **após** a primeira recuperação com retry do mesmo ID, expiração após gerações/pré-filtro, revogação/expiração do SID atual, quotas/roles/owner/tenant, ID não canônico, metadata antiga inconsistente e demonstração explícita do compromisso conjunto senha+prova.

O teste de reinício usa **dois processos Node reais**, diferentes PIDs: o primeiro sinaliza por IPC somente após o commit de recover e fica bloqueado antes de emitir a resposta; o teste mata esse processo próprio, observa perda HTTP, inicia outro processo sem memória anterior, nega reaplicação do ID já persistido e aplica uma nova intenção com versão 2 e contagem 3. A fixture exige URI local explícita e nome de banco de teste, não usa dotenv/fallback/seed/DDL nem imprime credenciais. Não é prova de todo modo possível de commit incerto/falha de infraestrutura.

Desenho anterior ao código preservado em `D:/programacao/documentos/issue-18-recuperacoes-sucessivas-pr29/DESENHO_ANTES_DO_CODIGO.md`; resultados/rótulos/saídas e CI do novo head ficam na nova evidência/PR #29. Não usar o CI de cf92402 como aprovação deste código. Sem merge, aceite na main, deploy ou encerramento. Frota consistente, cliente single-flight/redação de logs, abuso distribuído e resposta a comprometimento continuam requisitos operacionais não certificados.
