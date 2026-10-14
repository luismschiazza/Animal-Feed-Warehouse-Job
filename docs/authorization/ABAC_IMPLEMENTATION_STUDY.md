# Issue #4 — ABAC e isolamento: implementação incremental

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/4

## Estado real

**Em andamento — etapas 1 e 2: organização/vínculos e autenticação contextual.** Branch `feat/issue-4-abac-tenant-isolation`, baseada na main com #1–#3 integradas. Draft PR #9 acompanha o trabalho; NÃO pronto para integração.

O módulo está ligado à autenticação, mas os serviços de recursos ainda precisam de filtros e carregamento de atributos confiáveis. As políticas de dados operacionais exigem escopo e ficam negadas enquanto não houver organizationId confiável do recurso. Perfil/logout próprios continuam disponíveis quando conta e contexto da sessão são válidos. Não encerrar nem implantar este estado intermediário como isolamento completo.

## Diferença entre PBAC e ABAC

PBAC centraliza a política. ABAC fornece os atributos necessários para avaliar condições: organização do sujeito e do recurso, vínculo, dono, estado da conta/recurso e contexto.

Ter o papel MANAGER não deve autorizar registros de todas as organizações. Um mesmo usuário pode ser MANAGER em A e CUSTOMER em B. Papéis globais da conta não devem ser tratados como privilégios automáticos em qualquer empresa.

## Diagnóstico do código atual

- O modelo User mantém papéis globais legados por compatibilidade; a autenticação desta branch não os transforma em permissões de organização. Usa papéis do vínculo ou CUSTOMER para acesso pessoal.
- PoliciesGuard valida JWT/sessão e políticas, mas não carrega organização de recursos.
- UsersService, DisciplinesService e GradesService possuem consultas globais, como find(), findById() e findByIdAndUpdate(). Os demais serviços serão auditados na migração.
- Grade relaciona usuário/disciplina; filtrar só a nota não basta se for possível referenciar uma entidade de outra organização.
- Dados legados não possuem atribuição de organização validada. Não aplicar automaticamente uma organização padrão a todos os registros.

## O que foi implementado nesta etapa e por quê

### Organization

Arquivo: `src/features/organizations/schemas/organization.schema.ts`.

Collection organizations: nome limitado/normalizado, status active ou suspended, datas automáticas. Representa o limite empresarial de dados, não uma sessão de login.

### OrganizationMembership

Arquivo: `src/features/organizations/schemas/organization-membership.schema.ts`.

Collection organization_memberships: organização, usuário, status e papéis naquele vínculo.

- Status: invited, active, suspended e revoked.
- Novo vínculo é invited, não automaticamente active.
- Papel padrão CUSTOMER, sem autoatribuição administrativa.
- Papéis precisam ser conhecidos, não vazios, únicos e limitados ao enum.
- Índice único organizationId + userId: um vínculo por par, mas vários vínculos possíveis para a mesma pessoa em empresas diferentes.
- Referências declaradas com SchemaTypes.ObjectId para garantir casting para BSON ObjectId. Índices não substituem autorização e referências não garantem integridade referencial sozinhas.

Não há endpoint de criação de organização, ingresso ou concessão de papéis nesta etapa. Esses registros precisam de provisionamento confiável; não aceitar cadastro público atribuindo vínculo, status ou papéis por conta própria.

### OrganizationAccessService

Arquivo: `src/features/organizations/services/organization-access.service.ts`.

requireActiveMembership(userId, organizationId):

1. Valida formato dos identificadores.
2. Busca a organização exata com status active.
3. Busca vínculo do usuário exato nessa organização com status active.
4. Valida papéis persistidos, inclusive contra dados escritos sem validadores de schema.
5. Retorna organização/vínculo e papéis do banco, não do payload do cliente.

A resposta 403 é igual para vínculo ausente, organização inexistente ou suspensão, evitando revelar o motivo interno. Falha do banco não concede contexto.

SYSTEM_ADMIN também precisa de organização e vínculo válidos; este resolver não possui bypass administrativo.

Conta e sessão válidas são responsabilidades da autenticação, a integrar na próxima etapa. O resolver não autentica um userId arbitrário e não comprova que uma conta existe/está ativa por si só. Somente usar o usuário validado pelo servidor como entrada.

Estas leituras produzem um contexto daquele momento; não travam suspensão/revogação concorrente. A integração deve revalidar por requisição e definir comportamento para operações críticas já em andamento, sem prometer cancelamento retroativo.

### Módulos

OrganizationModelModule registra os dois schemas. OrganizationsModule disponibiliza OrganizationAccessService e agora é importado pelo AuthModule, utilizado pelo AppModule.

## Etapa 2 — Conta, sessão e organização

### Estado da conta

AccountStatus define pending, active e suspended. O schema User usa pending como padrão: um registro legado sem estado explícito não se torna ativo silenciosamente ao ser carregado. Cadastro público via UsersService cria somente conta pessoal active/CUSTOMER, sem aceitar organização, status ou papéis enviados pelo cliente.

Active não significa email verificado. Verificação de email/recuperação e outros reforços permanecem no planejamento correspondente; não declarar que foram implementados por esse campo.

Login exige senha correta e conta active. Após validar a senha, o serviço relê a conta antes de criar sessão. Cada acesso e refresh relê o estado. Conta ausente/suspensa/sem estado ativo recebe 401.

### Escolha de organização

LoginRequestDto aceita organizationId opcional (24 caracteres hexadecimais). Exemplo conceitual:

```json
{ "email": "usuario@example.com", "password": "senha", "organizationId": "0123456789abcdef01234567" }
```

O ID pedido é somente um candidato: o serviço confirma organização/vínculo ativos e busca papéis no banco antes de persistir a sessão. Sem vínculo, 403 sem criar sessão. Não há escolha automática da primeira organização nem ingresso automático.

Omitir organizationId cria sessão pessoal: organization_id null e papel efetivo CUSTOMER. Mesmo que a conta tenha o papel global legado SYSTEM_ADMIN, isso não autoriza dados empresariais.

### Organização da sessão e JWT

AuthSession contém organizationId BSON ObjectId (ou null para escopo pessoal). Campo imutável para atualizações normais do Mongoose; trocar de organização exige novo login. UserId também usa declaração SchemaTypes.ObjectId para casting confiável.

O JWT contém organizationId quando a sessão tem organização. A estratégia confirma consistência com a organização persistida, em vez de aceitar o claim como autorização. Em cada acesso, AuthService valida sessão/conta e recarrega vínculo e papéis. Mudança de papel, suspensão/revogação do vínculo ou suspensão da organização afeta o próximo acesso desse contexto; outra organização ou sessão pessoal não herda essa suspensão. Conta suspensa bloqueia todos os contextos.

Refresh mantém a organização do registro e ignora headers de organização; o body não admite trocar organizationId. O fluxo faz rotação atômica e depois revalida contexto. Se a revalidação falhar, nenhum par é emitido; o refresh apresentado pode ter sido consumido, exigindo novo login. Não há tolerância de replay/idempotência introduzida nesta etapa.

Suspender estado bloqueia acesso enquanto o estado estiver inválido; não apaga nem revoga automaticamente todas as sessões. Reativação pode tornar tokens ainda vigentes utilizáveis novamente. Revogação física em lote deve ser tratada explicitamente, não presumida a partir do campo status.

Uma sessão de organização com vínculo inválido também falha ao tentar seu perfil/logout pelo JWT. A conta ainda ativa pode fazer login pessoal; gestão de outras sessões será tratada na #5. Não há bypass de vínculo em autenticação nesta etapa.

### Condições ABAC e bloqueio intermediário

PolicySubject inclui estado da conta, organização e vínculo/status validados. PolicyEngine nega conta não ativa. Políticas de usuários e módulos escolares exigem organização/vínculo ativos e organizationId do recurso igual ao do sujeito.

PoliciesGuard ainda NÃO carrega organizationId dos recursos. Portanto, essas rotas de dados ficam temporariamente negadas (403), inclusive para administradores com vínculo ativo. Não copiar organizationId do usuário como se fosse prova do dono de qualquer ID solicitado: isso esconderia IDOR. A próxima etapa deverá carregar atributos confiáveis e filtrar os serviços antes de habilitar operações.

### Migração

Não foi executada atualização do banco da aplicação. Contas/seed legados sem status explícito serão pending e não farão login nesta branch; precisam de ativação revisada em plano de migração. Sessões antigas sem organização não ganham uma empresa: após ativação da conta, só permitem escopo pessoal. Papéis globais legados não são convertidos automaticamente em vínculos administrativos. Draft não deve ser implantado antes de resolver dados antigos, filtros e provisionamento.

## Testes e resultado

| Comando | Resultado nesta etapa |
|---|---|
| npm test -- --runInBand | 15 suítes, 151 testes aprovados |
| npm run test:abac com MongoDB 8 isolado | 9 testes de organização/vínculo aprovados |
| npm run test:sessions com MongoDB isolado | 23 testes de autenticação contextual/sessão/PBAC aprovados |
| npm run test:e2e -- --runInBand | 1 E2E existente aprovado |
| npm run build | Aprovado |
| npm run lint | Aprovado |

Testes novos comprovam:

- Vínculo em A não permite resolver B sem vínculo.
- Mesma pessoa tem papéis diferentes em A/B.
- Vínculos convidados, suspensos e revogados negados.
- Organização suspensa negada mesmo com vínculo administrativo ativo.
- Outro usuário não herda vínculo, e a consulta não cria organizações/vínculos automaticamente.
- Índice composto realmente criado e duplicação rejeitada no banco.
- Identificadores persistidos como BSON ObjectId, não strings.
- Papéis inválidos escritos via operação raw continuam negados pelo resolver.

Na primeira execução real, duas consultas legítimas falharam: referências string não eram convertidas corretamente pela declaração anterior. Alterado o tipo para SchemaTypes.ObjectId, incluídos testes do schema e do BSON persistido, e repetida a suíte completa com sucesso. Diagnósticos temporários removidos; nenhum log de depuração permanece no código.

Os testes isolados do resolver usam identificadores sintéticos de usuários. A suíte HTTP agora usa contas reais e comprova sessões A/B, papéis por vínculo, recarga de atributos, conta/org/vínculo suspensos, conta legada sem status, ausência de ingresso automático, JWT inconsistente, headers forjados e refresh sem troca de organização. Testes de leitura/alteração dos recursos e IDOR de entidades ainda estão pendentes.

Banco abac_test_* e sessions_test_* de nomes únicos; não usa MONGO_URL da aplicação. Containers e bancos dedicados removidos ao final. Nenhuma migração ou alteração no banco da aplicação foi executada.

## Reproduzir a suíte ABAC no PowerShell

```powershell
$name = "animal-feed-abac-test-" + [guid]::NewGuid().ToString("N")
$previousUri = $env:ABAC_TEST_MONGO_URL
try {
    docker run -d --rm --name $name -p "127.0.0.1::27017" mongo:8
    if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar MongoDB de teste" }
    $port = ((docker port $name 27017/tcp) -split ':')[-1].Trim()
    $env:ABAC_TEST_MONGO_URL = "mongodb://127.0.0.1:$port"
    npm run test:abac
    if ($LASTEXITCODE -ne 0) { throw "Testes ABAC falharam" }
} finally {
    docker stop $name
    $env:ABAC_TEST_MONGO_URL = $previousUri
}
```

Sem ABAC_TEST_MONGO_URL, a suíte falha explicitamente. Não usar o banco real da aplicação como ambiente de testes.

## Próximas etapas obrigatórias da #4

1. Estado da conta implementado; concluir o plano de migração e provisionamento sem ativação cega dos registros antigos.
2. Sessão/organização e recarga de vínculo implementadas; manter regressões ao migrar os serviços.
3. Escopo pessoal separado e sem organização automática implementado; operações de dados ainda negadas enquanto não houver atributos confiáveis.
4. Atributos de recurso: organização, proprietário/criador e estado com semântica por entidade.
5. Filtros obrigatórios nos serviços: id + organização em leitura/alteração/exclusão e organização em listagens. Não basta checar o controller e depois usar findById global.
6. Verificar todas as referências de criação/alteração/populate: usuário, disciplina e demais relações precisam de vínculo à mesma organização autorizada.
7. Separar administração de vínculo de administração de conta global: um administrador de A não pode alterar credenciais ou excluir uma conta compartilhada com B apenas por ter vínculo em A.
8. Plano de provisionamento e migração explícito, sem atribuição cega de registros antigos. Dados sem escopo validado devem falhar de modo fechado.
9. Testes HTTP e serviços reais: A/B, troca de ID, IDs de referências externas, conta/org/vínculo suspensos, proprietário e proibição de autoatribuição de papéis/organização.
10. Publicar/revisar a entrega completa, integrar após aceite e registrar conclusão. Não misturar com os reforços adicionais reservados ao planejamento após #6.

## Exercício de estudo

Desenhe usuário Luis → vínculo A (MANAGER) e vínculo B (CUSTOMER). Explique por que estar autenticado e ser MANAGER em A não permite editar B. Depois identifique no resolver de onde vêm os papéis e compare com o filtro atual de GradesService: é essa consulta global que ainda precisamos substituir.
