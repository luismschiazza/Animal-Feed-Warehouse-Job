# `/api/users` real: projeção e proposta de paginação (#24)

## Esta etapa: só projeção

`ScopedResourcesService.list(USER)` busca vínculos ativos da organização atual com `.select('userId roles -_id').lean()`. Os demais campos não são usados no cruzamento em memória. O predicado `organizationId`/`status`, os filtros de contas, a exclusão do ator, a ordem retornada pelo Mongo, o DTO, as verificações do guard e do serviço e a auditoria não mudam. A projeção não se aplica à consulta de autoridade do ator. Não foi criado cache nem alterado índice, dependência ou contrato.

A [documentação MongoDB 8 de projeção](https://www.mongodb.com/docs/v8.0/tutorial/project-fields-from-query-results/) explica inclusão e exclusão de `_id`; não pressupomos consulta coberta. `explain('executionStats')` examinou as mesmas quantidades nas duas formas: 53, 603 e 2.403 documentos. Tamanho BSON somado dos vínculos retornados (não tráfego na rede, sem framing): **8.000 → 2.734**, **92.975 → 31.609** e **371.075 → 126.109 bytes**, respectivamente. Nenhuma alteração na resposta HTTP.

## Medição HTTP antes e depois

Linux Docker/WSL2 no mesmo host, imagens existentes Node 24.22.1, Nest 11.2.8, Mongoose 8.24.7 e Mongo 8.0.34, replica set descartável de nó único, loopback sem portas externas. `AppModule` e `configureApp` reais, modo `test` sem simulação. JWT obtido via login real fora da janela cronometrada; cada GET percorre os guards, serviços, consultas, DTO e auditoria. O relógio cobre a resposta HTTP até ler/validar o corpo (inclui custo do cliente no mesmo container). Sem latência externa/TLS, sem concorrência de escrita, sem simular autorização, e não é carga de chegada independente. Cada cenário tem 16 requisições de aquecimento excluídas, 100 medidas, quatro clientes concorrentes, duas rodadas por versão. A fixture também contém o próprio ator, uma conta suspensa e um vínculo suspenso além dos membros ativos esperados. Ausência de dados de outros tenants e papéis locais conferidos em cada resposta.

p50 / p95 / p99, em ms:

- **50 usuários**: antes `232,40 / 341,67 / 398,04` e `231,11 / 303,13 / 311,86`; depois `220,74 / 310,88 / 375,50` e `228,04 / 283,33 / 329,77`. Caudas variaram e os intervalos de p95 se sobrepõem.
- **600 usuários**: antes `267,07 / 381,83 / 453,16` e `285,56 / 368,83 / 416,57`; depois `260,47 / 344,48 / 385,12` e `255,99 / 340,00 / 369,42`.
- **2.400 usuários**: antes `543,19 / 717,51 / 764,05` e `476,88 / 709,88 / 808,17`; depois `372,42 / 557,49 / 784,18` e `402,22 / 506,15 / 559,95`. p95 melhor nas duas amostras; p99 não melhorou uniformemente. A meta de 300 ms não foi atingida nesse volume.

**Zero erros** nas 1.200 requisições medidas e nos aquecimentos; hashes HTTP idênticos entre rodadas para cada volume. Payloads de 9.411, 113.536 e 457.436 bytes. Em todas as medições a consulta de conferência confirmou autorização persistida, tanto guard quanto serviço, por `requestId`, ator e organização. A nova projeção não elimina o custo do corpo sem paginação. Os números descrevem esta fixture, não SLO de produção. JSONs, planos e comandos em `D:/programacao/documentos/issue24-users-http-20261124/`.

## Configuração real de latência

`test/development-latency.e2e-spec.ts`: `.env` sintético em temporário próprio, `ConfigModule.forRoot` com `validateEnvironment` real, `configureApp` e GET HTTP com `AppController`. Testa ausência e `false` em `development`, `true` em `development`, `true` em `test` e `true` em `production`. O spy observa a chamada **real** do interceptor e preserva sua execução; não depende de comparar milissegundos. Usa módulo mínimo para a flag, sem carregar um banco real ou ler `.env` do projeto. Referência: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration).

## Paginação proposta — **não implementada**

**Compatibilidade.** Manter `GET /api/users` com o mesmo array/envelope e comportamento. Adicionar, em próxima etapa, `GET /api/users/page?limit=50&after=<cursor>` em rota estática registrada antes de `/:id`, documentada no Swagger. A versão paginada retorna `payload: { items, nextCursor }` com os mesmos `UserDto`. Limite 1–100, default 50, DTO validando cursor/limite; clientes legados não mudam. Migrar clientes explicitamente, sem impor truncamento ao legado. Não usar contagem total por página.

**Autorização e plano.** Repetir as mesmas regras de listagem e revalidações do ator; não usar na rota nova o guard que materializa a lista inteira sem antes desenhar o fluxo equivalente. O tenant vem exclusivamente da sessão revalidada. Reter auditoria e DTO; cursor versionado validado para a organização e ordem atual, não prova de permissão. Ordenar por `Membership.userId` crescente com igualdade no tenant e range exclusivo após o cursor (em vez de `skip` crescente, [MongoDB 8 cursor.skip](https://www.mongodb.com/docs/v8.0/reference/method/cursor.skip/)). Começar por `explain` no índice existente único `(organizationId, userId)`, com `status: active` residual; não impor índice novo sem evidência. Buscar as contas ativas do lote, excluir o ator, projetar DTO e repor a ordem do vínculo em memória.

**Progresso e concorrência.** Usar lotes limitados, com orçamento de varredura explícito (por exemplo até 400 vínculos candidatos por chamada) e sem busca infinita atrás de contas inativas. Se chegar ao limite de itens, o cursor avança até o último vínculo consumido, não até o fim do lote lido antecipadamente; se esgotar orçamento, devolve página parcial ou vazia com cursor para continuar. `null` só quando o conjunto foi esgotado. Páginas não são snapshots: inclusões, suspensões e remoções concomitantes podem mudar o conjunto entre chamadas; cada página relê autoridade. Não reutilizar cursor de outra org, e jamais remover o filtro do tenant por causa do cursor.

**Próxima validação.** Contrato legado e prioridade de rota; cursores inválidos e cross-tenant; autorização revogada entre páginas; IDs únicos e sem omissões na população estável; contas/vínculos suspensos e próprios; páginas vazias com progresso; ordem repetível; concorrência documentada; auditoria correlacionada para permitido e negado; `explain` e p95 por tamanho de página com auditoria ativa, sob carga representativa. Nenhum cliente foi migrado nem há mudança de API nesta PR.
