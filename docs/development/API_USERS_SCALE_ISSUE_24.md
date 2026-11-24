# Usuários: paginação opt-in e medição em 10k/20k (#24)

## Contrato

`GET /api/users` permanece intacto: mesmo array no envelope, sem paginação ou truncamento implícito. `GET /api/users/page` é uma rota estática nova, anterior a `/:id`. Requer o mesmo JWT e a mesma política de listagem da organização ativa. Não é uma API de administração global.

- `GET /api/users/page?limit=50`: `limit` inteiro decimal canônico de **1 a 100**, default **50**. `after` é opcional; use somente o cursor da resposta anterior. Parâmetros extras, limites repetidos e cursores inválidos são rejeitados com `400` quando autorizado. Falhas de autenticação/autoridade continuam seguindo o fluxo normal (`401`/`403`).
- Resposta: `{ "payload": { "items": [/* UserDto */], "nextCursor": "..." }, "message": "..." }`. A ordem é `userId` ascendente. `nextCursor: null` encerra a navegação. Uma página parcial **ou vazia** pode trazer cursor: continue até `null`, não até o primeiro `items.length < limit`. `limit` pode mudar entre chamadas. Trate o cursor como opaco e use URL-encoding ao montar a query.
- O cursor é assinado (HMAC-SHA256 com chave derivada em domínio separado do segredo JWT), não criptografado. Vincula posição, versão/filtro fixo, organização e ator. Não é credencial nem autoriza consulta; reutilizá-lo exige uma nova requisição autenticada e autorizada. Não há TTL próprio; trocar o segredo invalida cursores existentes. Trocar ator, organização ou filtros exige recomeçar; um cursor inválido de uma navegação anterior deve ser descartado, não editado.
- A leitura é **ao vivo, não snapshot**. Uma suspensão ou mudança de papel já concluída antes da nova validação é relida. Inserções com `userId` posterior à posição podem aparecer; anteriores ficam atrás do cursor. Remoções não invalidam a posição. Mudanças concorrentes durante as duas leituras de dados podem afetar a resposta em andamento; para reconstruir uma visão atual, inicie outra navegação. Um aplicativo não deve usar a lista como prova de autoridade.

## Desenho

O guard global e `ScopedResourcesService.authorize(USER, LIST, ...)` continuam sendo executados; o serviço revalida sessão, conta, organização e vínculo, aplica a política e persiste auditoria. Não usamos `ExcludeOwnUserGuard` na rota nova porque ele materializa a lista legada; a exclusão do ator é aplicada na busca paginada. Não cacheamos autoridade nem alteramos transações, guards ou auditoria.

A paginação usa range estrito em `userId` no índice único existente `(organizationId, userId)`. Lê no máximo `2 × limit + 1` vínculos, com projeção de `userId`, `status` e `roles`; o registro extra só indica que há mais candidatos. Vínculos inativos contam no orçamento para evitar uma varredura arbitrária. Consulta no máximo `2 × limit` IDs de contas elegíveis, sempre a partir dos vínculos daquela organização e com conta ativa. Restaura a ordem dos vínculos, usa os papéis do tenant e serializa com o mesmo `UserDto`. A posição é o último vínculo **consumido**, não o último buscado antecipadamente.

Sem índice novo: com 20.000 usuários, a sonda `explain` de uma página após o meio da organização usou o range do índice existente, sem `SORT` bloqueante: **101 chaves/documentos de vínculos** e **101 chaves/100 documentos de contas** (`_id_`), para `limit=50` e população densa. A lista inteira examinou **20.003 vínculos e 20.002 contas**. As sondas reproduzem as formas de consulta, não são somas de latências HTTP. Um índice novo para excluir inativos no Mongo teria custo de armazenamento, manutenção em cada mutação de vínculo/status e rollout; não se justifica para limitar a leitura atual. Uma organização com vínculos muito esparsos pode exigir mais páginas, mas não um scan ilimitado em uma chamada.

## Medições verificáveis

Base `92c2710`; candidato com mesma infraestrutura e rotas legadas intactas. MongoDB 8.0.34 em replica set de um nó com loopback, Docker Desktop/WSL2 x86-64, 8 CPUs e 11,6 GiB visíveis, Node 24.22.1/Nest 11.2.8/Mongoose 8.24.7. AppModule real em `test` sem delay, cliente HTTP e servidor Nest no mesmo processo, Mongo em contêiner separado na mesma namespace, sem rede externa, TLS, SMTP, carga concorrente de escrita ou distribuição de réplicas. Login real fora da janela cronometrada. Cronômetro inclui leitura/parse e validação do payload no cliente. Vários tenants na série de 4 clientes; no par sustentado comparável de 20k, banco novo com o tenant de 20k. Cada GET mede uma resposta (página de 50 ou lista inteira), **não** o tempo para percorrer todos os usuários paginados.

**Quatro clientes fechados:** 8 aquecimentos, janela de início de 12 s por caso, espera das requisições em voo (12,1–13,7 s observados nas rodadas abaixo). Comparação em **p50/p95/p99 em ms; req/s**:

- **50:** legado base `223/288/325; 17,29`; legado pós `222/290/327; 17,39` e `222/303/326; 17,34`; página `224/294/327; 17,22` e `232/460/473; 14,72`.
- **10.000:** legado base `988/1.284/1.512; 3,87`; legado pós `960/1.075/1.211; 4,07` e `978/1.151/1.209; 3,99`; página `222/277/339; 17,27` e `233/375/394; 15,62`.
- **20.000:** legado base `1.771/2.234/2.705; 2,18`; legado pós `1.790/2.383/2.729; 2,13` e `1.845/2.279/2.408; 2,05`; página `222/275/348; 17,43` e `231/419/443; 15,30`.

A sonda inicial da base registrou p95 `298/1.169/2.197 ms`, sem contagem de operações (o monitor do driver ativado após conectar não emitiu eventos). A comparação instrumentada acima usa callback Mongoose que conta por método/coleção sem salvar argumentos ou credenciais; não é contagem direta de pacotes, `getMore` ou comandos internos do servidor. As duas rodadas pós mostram variação na cauda, inclusive no tenant pequeno; o legado pequeno ficou próximo ao baseline, não há evidência de regressão sistemática nem de ganho no legado.

**Oito clientes, carga sustentada curta:** 16 aquecimentos, janela de 25 s e drenagem (25,2–28,1 s). Mesma métrica:

- **10.000:** legado base `1.932/2.523/2.771; 3,92` (106), legado pós `1.628/2.012/2.338; 4,79` (127), página `280/348/387; 27,82` (700).
- **20.000:** legado base `3.190/4.458/4.662; 2,32` (65), legado pós `3.256/4.616/5.202; 2,30` (64), página `295/521/577; 24,16` (609).

**A meta p95 < 300 ms não foi atingida de forma consistente em nenhum dos dois volumes.** Passou em uma das duas rodadas de 4 clientes para ambos e falhou na outra e com 8 clientes. Sem erros inesperados nas rodadas publicadas; o teste negativo dedicado com 8 clientes confirmou 64/64 respostas `401` e 64 decisões de autenticação negadas persistidas, tanto na rota base quanto na rota nova. Testes de integração cobrem entradas inválidas, cursor alheio ou adulterado, atualização/inserção/remoção/suspensão entre páginas, revogação de autoridade, paginação vazia com progresso, isolamento e auditoria. Hash do legado idêntico antes/depois por perfil; página validada contra IDs e papéis da fixture; sucesso de guard e serviço persistidos por requisição.

**CPU e memória:** na janela de 8 clientes, o processo Node (API + cliente) consumiu `38,45 → 14,21 s` de CPU em 10k e `40,32 → 14,62 s` em 20k, comparando legado pós e página na mesma rodada, apesar de muito mais respostas na página. O corpo caiu de 1.912.836/3.847.836 bytes para ~9.529. RSS ao fim em 10k: `879 → 884 MiB`; em 20k `886 → 879 MiB`. Páginas foram medidas depois do legado no mesmo processo, cujo alocador retém memória; esses números **não** medem quanto ocuparia um processo servindo apenas páginas, nem CPU/RSS do processo Mongo. JSONs preservam CPU, RSS, heap/início/fim, pico cumulativo, throughput, contadores e planos. Não extrapolar capacidade de produção, p99 de longo prazo nem economia percentual de memória.

## Próximas investigações (por prioridade)

1. **Custo fixo de autorização/sessão/auditoria:** ambas as rotas em uma organização densa fizeram, por GET, 3 agregações de sessão, 3 checagens de revogação/conta/organização/vínculo (de cada), 3 inserções de auditoria e 2 operações de listagem. Separar tempo Mongo, espera de pool, lacunas de agendamento e serialização com um gerador externo e carga de chegada controlada, incluindo revogações e escritas. Não deduplicar verificações entre camadas nem cachear autoridade com base só nesta contagem. A sonda curta de `/api/auth/sessions` ficou em p95 445 ms na fixture corrigida; investigar sob distribuição realista de sessões/revogações.
2. **Produtos com arquivados concentrados:** `/api/products?limit=50` p95 426 ms na sonda de 4 s (quatro clientes); `explain` reproduzindo `archivedAt:null` e `_id` descendente examinou 551 documentos para 51 quando os 500 mais recentes estavam arquivados. Estudar índice parcial tenant/`_id` somente se a distribuição real confirmar o custo; medir tamanho, carga nas escritas, implantação/reversão e manter guarda de índice único e transações. Nenhuma mudança nesta etapa.
3. **Auditoria e serialização:** `/api/audit/organization-events?limit=50` p95 295 ms na sonda curta, já limitada. Repetir com retenção e read/write concorrentes representativos antes de propor outra projeção/índice. Manter `UserDto`; não há isolamento de CPU suficiente para atribuir todo o ganho à serialização.

## Reprodução e referências

Comandos, saídas, planos completos e ambiente descartável em `D:/programacao/documentos/issue24-users-scale-20261124/` (`node run.cjs setup`, `pre-repeat`, `post-http`, `post-repeat`, `pre-sustained`, `pre-sustained-20k`, `post-sustained-10k`, `post-sustained-20k`, `post-diagnostics`; nunca executar sobre evidência selada ou banco existente). Referências consultadas em 24/11/2026: [MongoDB 8 range/skip](https://www.mongodb.com/docs/v8.0/reference/method/cursor.skip/), [NestJS Validation](https://docs.nestjs.com/techniques/validation), [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
