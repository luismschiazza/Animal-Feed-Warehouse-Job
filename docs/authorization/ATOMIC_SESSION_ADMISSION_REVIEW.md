# #17 — Revisão pré-PR: relógio, contenção e rollout

## Atualização posterior — integração aprovada e revalidada

PR #26 MERGED, merge `d86295c65f5a6522f146f5f35e1dbcdb292359d2`; responsável autorizou integrar e encerrar SOMENTE após reexecutar tudo na main. **258 unitários/97 HTTP-MongoDB/13 vínculos/1 E2E e todos os smokes/build/lint/TypeScript/diff passaram NA MAIN.** [Aceite completo](ATOMIC_SESSION_ADMISSION_MAIN_ACCEPTANCE.md). #12 aberta 2/8, #18 não iniciada, nenhuma implantação. Esta autorização substitui a proibição histórica abaixo, preservando os riscos/runbook e limites operacionais.

## Autorização e escopo da revisão pré-PR (histórico)

Revisão solicitada sobre a primeira entrega `dbc692287cc082cd4f4de4026ede88bd381f21e0`, na mesma branch `feat/issue-17-atomic-session-admission`. O responsável autorizou corrigir falhas comprovadas, testar/documentar e depois criar PR para main. **NÃO autorizou merge nem encerramento da issue.** Main permanece `215138b`; #1–#6/#16 preservadas, #18 não iniciada. Nenhum banco/conta/email real alterado.

**PR aberta para main: [#26](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/26).** Correção de código/revisão `7b949e8893e0f589e9333f881df0687085945a40`, após primeira entrega `dbc6922`. PR OPEN, sem auto-merge e sem referência de encerramento automático da issue. #17 permanece OPEN/In review; main não foi alterada.

Este relatório prevalece sobre os estados históricos “sem autorização para PR” do estudo inicial. A criação de PR não é aceite de produção nem permissão de implantação.

## 1. Corrida assertClock → sessão — COMPROVADA e corrigida

### Reprodução anterior à correção

Teste com duas aplicações Nest, pools independentes e MongoDB replica set descartável:

1. Criar sessão válida.
2. Executar o `assertClock()` original: watermark <= $$NOW, logo passa.
3. Antes de `findOne`, avançar SOMENTE o watermark do banco descartável, simulando regressão do relógio em relação ao último instante observado. Nenhum relógio do SO/NTP foi alterado.
4. Deixar a leitura original executar: seu filtro verificava apenas revokedAt/expiração, não o watermark.
5. O teste esperava rejeição, mas recebeu sessão ativa: **Received promise resolved instead of rejected**.

Logo, repetir uma checagem antes da leitura não elimina TOCTOU. Não basta atribuir toda a janela à limitação genérica de autorização por snapshot: o watermark e a própria elegibilidade eram obtidos em comandos distintos, sem ponto consistente compartilhado.

### Correção

`SessionSerializationService.readSessions<T>(pipeline)` substitui o `assertClock()` separado:

- Um único aggregate iniciado em `session_serialization`, `_id` de aplicação escolhido no servidor.
- Calcula `usable` com data BSON válida e `$$NOW >= serverNow`.
- Faz `$lookup` em `auth_sessions`, permitindo o pipeline de leitura apenas quando `usable` é true.
- Relógio e elegibilidade usam o MESMO `$$NOW` do comando e **readConcern snapshot**, em primary. Leitura snapshot fora de transação é suportada pelo MongoDB 8/replica set exigido; não há fallback para standalone/leitura local mais fraca.
- Pipeline tipado exclui `$out/$merge`; é construção interna, nunca pipeline do cliente.
- maxTimeMS de 5s e timeout de driver de 10s. Ausência/regressão/erro de leitura falha fechado com 503, sem expor erro bruto.
- Não escreve no coordenador nem abre transação de escrita. Não colocou cada JWT/listagem na fila global de mutações.

Aplicado em findActive, findTarget, listas própria/organizacional e leituras de refresh/replay/teto. `guardedOne` projeta fora `currentTokenHash` e `consumedTokens`: **aggregate não respeita select:false do Mongoose automaticamente**. Listas continuam com projeção/mapper positivos.

Após commit da admissão, a sessão passa por findActive antes de retornar credencial. O CAS de refresh segue atômico no documento e SEM entrar no coordenador global; após um CAS vencedor, uma nova leitura conjunta valida relógio/sessão antes de retornar a próxima credencial. Se falhar, o verificador pode ter sido consumido e exigir login: **não restaurar segredo, não devolver token por suposição, não revogar automaticamente**. O teste de interleaving pós-CAS confirma consumo + nenhuma credencial liberada; replay posterior continua revogando somente quando comprovado, como #2.

No escritor do coordenador, a atualização passou a pipeline `serverNow: '$$NOW'` e incremento de sequência; condição e valor gravado usam a mesma referência de comando, em vez de combinar condição $$NOW com $currentDate. Data malformada também é rejeitada no filtro, não reparada silenciosamente.

### Limite preciso da garantia

A leitura conjunta decide sobre um snapshot único, NÃO cancela uma ação já autorizada se relógio/regra/membership mudar depois desse ponto. As regras em lote/específicas continuam autoritativas e append-only; em findActive há ainda rechecagem posterior da regra, que pode reforçar negação. Listas incluem lookup de revogação no próprio pipeline snapshot. Não há promessa de relógio infalível, leitura de futuro, cancelamento retroativo, eleição/failover certificado ou JWT independente de NTP/UTC.

## 2. Contenção — risco real de disponibilidade, sem enfraquecer atomicidade

O documento global por aplicação serializa admissão, configuração e revogação. Um escritor lento/abandonado pode bloquear novas admissões de A E B, mesmo sem compartilhar identidade. O timeout limita espera/retries, mas NÃO cria isolamento de disponibilidade entre empresas, garante throughput/p95 ou limita a quantidade de requisições simultaneamente esperando. Rate limiting/observabilidade/capacidade seguem #20/#14/#24, sem implementação antecipada.

Mudança limitada e justificável nesta revisão: após filtro usuário+organização+validade e lookup autoritativo, aplicar `$limit: policy.limit` ANTES de `$count`. Para decidir `count >= limit`, basta `min(count, limit)`. Reduz trabalho/tempo de lock quando há muitas sessões legadas acima do limite; não ignora regras e não usa contagem aproximada. Muitos registros revogados ainda podem exigir varredura; não se afirma que o custo ficou constante.

Provas repetidas:

- Cinco rodadas de 12 logins com barreira em duas aplicações: 3 admissões/9 recusas, limite padrão 3.
- Coordenador bloqueado por transação real: oito consultas HTTP de sessões continuam concluindo enquanto o lock está mantido. O valor de sequência confirmado não muda nessas leituras.
- No MESMO cenário, admissões A/B recebem 503 no orçamento do driver, sem novas sessões/credenciais/revogações. Após abort do detentor, ambas voltam a admitir.
- O teste usa limite de 5s para detectar leitura indevidamente enfileirada, não é benchmark/p95/SLO. TLS/HA/eleição/máquinas distribuídas não foram certificados.

Não dividir o coordenador por tenant sem reprojetar e provar corridas com regra global de usuário, configuração e contexto pessoal. Não reduzir proteção, abrir bypass no timeout ou executar trabalho externo no callback transacional. Uma otimização mais ampla não é inferida como autorizada.

## 3. Rollout — parar processos NÃO é barreira de credencial

### Risco confirmado

O código anterior da main não conhece o coordenador. Somente criar a coleção, reiniciar algumas instâncias ou checar versão no código novo NÃO impede um binário/job antigo com credencial válida de inserir sessões/regras/revisões fora do protocolo. Isso invalida a prova de atomicidade. Alterar só a senha pode não retirar as permissões de conexões já autenticadas. Automatic rollback com imagem antiga e credencial nova também reintroduz o bypass.

As identidades deste runbook são **principais do MongoDB**, não contas de funcionários da loja; não é recuperação de senha da #19.

O smoke COM autenticação provou a barreira relevante no banco descartável: um principal legado separado inseriu antes da retirada de suas roles; após `updateUser` retirando suas roles, operações novas de insert/update na conexão já aberta foram NEGADAS. O principal novo/restrito continuou operando, inclusive readSessions snapshot/lookup, transação e exportação. Isso é prova isolada, NÃO configuração de produção nem cancelamento de operação já em voo.

### Runbook obrigatório / bloqueador operacional

1. Aprovar janela de manutenção e plano de retorno/backup coerente sob #14, em autorização operacional separada. **Não fazer rolling deployment misturando protocolos.**
2. Inventariar TODOS os escritores: API, workers, scripts/CLIs agendados, réplicas esquecidas, hosts e jobs de rollback. Drenar requisições/transações em voo; parar escritores antigos.
3. Retirar as permissões dos principais legados ou desabilitá-los de forma planejada; usar identidade runtime nova/distinta e privilégio mínimo. Confirmar negação de novas escritas por conexões legadas, sem imprimir segredos. Revogar roles não cancela retroativamente operação já autorizada: drenagem e checagem de transações continuam necessárias. Se houver principal compartilhado/broad role que não possa ser isolado, **bloquear o rollout**, não confiar no marcador.
4. Garantir que imagens/scripts antigos não recebam a identidade nova. Desabilitar rollback automático para binários pré-protocolo. Separar credencial operacional/DDL da runtime e da leitura/exportação; permissões aditivas readWrite/dbOwner/root anulam a separação de journals.
5. Confirmar replica set/MongoDB 8, relógios disciplinados, índices/ausência de TTL nos journals/coordenador, permissões e backup/restauração coerentes. Avaliar datas legadas malformadas/futuras com o operador; não reatribuir/normalizar dados silenciosamente. Instalação nova da loja continua banco vazio, sem importar escola.
6. Em instalação realmente vazia, bootstrap empresarial deliberado ANTES de criar documento de coordenação; depois inicializadores de auditoria/configuração/coordenador, API parada. CLI da #17 exige URI explícita e não prova sozinho que escritores antigos foram retirados.
7. Iniciar SOMENTE versão aprovada, sem abrir tráfego ainda. Smoke autorizado em escopo apropriado: login/configuração, limite/revogação/refresh, A/B/pessoal e auditoria; depois liberar tráfego conscientemente. Não executar este runbook no banco real nesta tarefa.
8. Em falha, fechar tráfego/parar escritores e recuperar coerentemente sob decisão operacional. NÃO zerar sequência/recuar watermark, apagar regras, dar acesso amplo à runtime ou simplesmente subir código antigo contra estado novo. Caso se considere restaurar estado anterior, avaliar explicitamente recuperação de revogações para não ressuscitar credenciais; não há rollback automático seguro prometido.

A aplicação não tem poderes administrativos para descobrir/frear todo escritor antigo. Nenhum flag “maintenance=true” fictício foi adicionado para simular essa garantia. A retirada de escritores/identidades e o controle de distribuição de artefatos são **pré-condições de implantação**, não algo certificado por um startup check. Nenhum usuário/role/banco real foi alterado e a #14 não foi implementada nesta entrega.

## 4. Resultados após a correção (NA BRANCH)

| Verificação | Resultado |
|---|---|
| Unitários | **258 / 21 suítes** |
| HTTP/MongoDB | **97 / 2 suítes** (77 regressões +20 cenários #17) |
| Vínculos/provisionamento | **13 / 2 suítes** |
| E2E | **1** |
| Smokes AppModule real, ACL autenticada/retirada de principal legado/exportador, CLI isolado | **PASS** |
| Build, lint, TypeScript incluindo testes e diff check | **PASS** |

Reprodução anterior: teste específico falhou porque a sessão foi retornada após regressão intercalada. Depois: o teste reproduz explicitamente o algoritmo antigo inseguro e demonstra que todas as leituras guardadas rejeitam o MESMO estado; caso separado força mudança após CAS e comprova nenhuma credencial retornada. Testes de contenção e todas as regressões foram repetidos. Ajustes intermediários de tipagem de pipeline/lookup foram corrigidos; não são resultados aceitos.

Servidores EXCLUSIVAMENTE descartáveis `issue17-review-tests` e `issue17-review-acl`, bancos únicos gerados pelos testes. Sem uso da aplicação MONGO_URL real, dados reais, email real, force-push ou reescrita de histórico. **Limpeza confirmada:** ambos os containers parados/removidos (--rm), nenhum outro ambiente afetado; portas 64937/49706 são históricas e não devem ser reutilizadas cegamente. Bancos/papéis/usuários e volumes anônimos eram descartáveis. Identificadores de commit/PR constam no registro Git/GitHub e na continuidade externa. PR para main autorizada após esta revisão; **merge/encerramento da #17 continuam proibidos sem aprovação do responsável**.
