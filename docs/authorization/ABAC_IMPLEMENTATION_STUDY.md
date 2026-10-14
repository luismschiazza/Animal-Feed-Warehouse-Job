# Issue #4 — ABAC e isolamento: implementação incremental

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/4

## Estado real

**Em andamento — etapa 1: organização e vínculos.** Branch `feat/issue-4-abac-tenant-isolation`, baseada na main com #1–#3 integradas.

Esta etapa ainda NÃO conecta o novo módulo ao AppModule, à autenticação ou às consultas dos recursos. Não declarar isolamento transversal pronto: os serviços atuais ainda possuem consultas globais. Não encerrar a issue nem implantar esta etapa como solução de isolamento completa.

## Diferença entre PBAC e ABAC

PBAC centraliza a política. ABAC fornece os atributos necessários para avaliar condições: organização do sujeito e do recurso, vínculo, dono, estado da conta/recurso e contexto.

Ter o papel MANAGER não deve autorizar registros de todas as organizações. Um mesmo usuário pode ser MANAGER em A e CUSTOMER em B. Papéis globais da conta não devem ser tratados como privilégios automáticos em qualquer empresa.

## Diagnóstico do código atual

- User possui papéis globais, sem vínculos por organização.
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

OrganizationModelModule registra os dois schemas. OrganizationsModule disponibiliza OrganizationAccessService para futura integração. Ainda não está importado no AppModule/AuthModule.

## Testes e resultado

| Comando | Resultado nesta etapa |
|---|---|
| npm test -- --runInBand | 14 suítes, 138 testes aprovados |
| npm run test:abac com MongoDB 8 isolado | 9 testes de organização/vínculo aprovados |
| npm run test:sessions com MongoDB isolado | 12 regressões de sessão/PBAC aprovadas |
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

Os testes do resolver usam identificadores sintéticos de usuários: validam o vínculo, não a autenticação da conta. Testes de login/conta/recursos entre organizações ainda serão implementados.

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

1. Estado da conta: impedir autenticação/uso de conta suspensa e definir migração dos registros sem estado.
2. Vincular sessão a organização selecionada e validada no servidor; recarregar vínculo/papéis atuais, sem confiar em headers/claims como permissão.
3. Conta sem vínculo não deve ganhar organização ou dados operacionais por padrão. Definir acesso pessoal de perfil/logout separadamente.
4. Atributos de recurso: organização, proprietário/criador e estado com semântica por entidade.
5. Filtros obrigatórios nos serviços: id + organização em leitura/alteração/exclusão e organização em listagens. Não basta checar o controller e depois usar findById global.
6. Verificar todas as referências de criação/alteração/populate: usuário, disciplina e demais relações precisam de vínculo à mesma organização autorizada.
7. Separar administração de vínculo de administração de conta global: um administrador de A não pode alterar credenciais ou excluir uma conta compartilhada com B apenas por ter vínculo em A.
8. Plano de provisionamento e migração explícito, sem atribuição cega de registros antigos. Dados sem escopo validado devem falhar de modo fechado.
9. Testes HTTP e serviços reais: A/B, troca de ID, IDs de referências externas, conta/org/vínculo suspensos, proprietário e proibição de autoatribuição de papéis/organização.
10. Publicar/revisar a entrega completa, integrar após aceite e registrar conclusão. Não misturar com os reforços adicionais reservados ao planejamento após #6.

## Exercício de estudo

Desenhe usuário Luis → vínculo A (MANAGER) e vínculo B (CUSTOMER). Explique por que estar autenticado e ser MANAGER em A não permite editar B. Depois identifique no resolver de onde vêm os papéis e compare com o filtro atual de GradesService: é essa consulta global que ainda precisamos substituir.
