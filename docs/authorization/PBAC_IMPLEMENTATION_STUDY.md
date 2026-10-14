# Issue #3 — PBAC: implementação e guia de estudo

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/3

## Estado

Implementação validada, preparada para revisão na branch `feat/issue-3-pbac-policy-engine`, baseada na main integrada pelo PR #7. A issue #2 já foi concluída e integrada. Este documento não declara a #3 integrada ou implantada em produção.

## O problema que resolvemos

No RBAC anterior, controllers declaravam papéis diretamente e algumas rotas só exigiam JWT. O RolesGuard permitia continuar se não encontrasse papéis declarados. Era fácil adicionar uma rota e esquecer uma restrição.

Agora a API usa um guard global: rota não pública exige sessão válida e requisito de política explícito. A ausência de requisito ou definição não concede acesso, inclusive para SYSTEM_ADMIN.

PBAC centraliza a decisão em políticas. As políticas iniciais ainda usam papéis como principal atributo; isso não transforma a implementação em isolamento ABAC completo. Organização, vínculo e estado de recursos serão tratados na #4.

## Fluxo de uma requisição

```text
Requisição
  ↓
Rota marcada explicitamente como pública?
  ├── Sim: libera esta etapa; login/refresh continuam validando credenciais
  └── Não
       ↓
     Passport: JWT assinado e não expirado + sessão ativa e dono correto
       ├── Falha de autenticação: 401
       └── Sucesso
            ↓
          Existe requisito de política?
            ├── Não: 403
            └── Sim
                 ↓
               Motor avalia todos os requisitos
                 ├── Ausência de definição/papel/condição: 403
                 └── Todos permitem: controller executa
```

Falha do banco não libera acesso; pode resultar em erro de infraestrutura em vez de 401. Não transformar indisponibilidade em autenticação aprovada.

## Arquivos e responsabilidades

### policy.types.ts

Define ação, recurso, sujeito, atributos e contexto tipados.

- Ações: create, list, read, update, delete e revoke.
- Recursos: user, profile, session e os quatro recursos escolares legados.
- Sujeito: id, papéis e sessionId provenientes da autenticação.
- Recurso: tipo, id e atributos preparados para evolução.
- Ambiente: método HTTP e IP observado pelo servidor.

Tipos orientam o desenvolvimento, mas não substituem validação de dados externos. Nunca aceitar papéis/ownerId enviados pelo cliente como autoridade de autorização.

### policy.registry.ts

Registry central e controlado pelo servidor, com 26 definições explícitas:

| Recurso | Ações | Permissão inicial |
|---|---|---|
| user | list, read, update, delete | SYSTEM_ADMIN |
| profile | read | Papel conhecido e perfil do próprio sujeito |
| session | revoke | Papel conhecido e sessão do próprio sujeito |
| legacy_discipline | create, list, read, update, delete | MANAGER ou SYSTEM_ADMIN |
| legacy_attendance | create, list, read, update, delete | MANAGER ou SYSTEM_ADMIN |
| legacy_grade | create, list, read, update, delete | MANAGER ou SYSTEM_ADMIN |
| legacy_meeting | create, list, read, update, delete | MANAGER ou SYSTEM_ADMIN |

Não há wildcard, herança automática de papéis ou bypass administrativo. USER:create não existe como política protegida porque o cadastro público permanece uma exceção explícita, limitado a CUSTOMER no serviço.

**Mudança intencional de acesso:** listagens escolares e leitura de notas antes permitidas a qualquer autenticado passam a exigir MANAGER/SYSTEM_ADMIN. CUSTOMER e papéis comerciais não recebem acesso implícito ao domínio escolar.

### policy-engine.service.ts

Avalia uma definição contra contexto. Sujeito sem papéis/sessão, papel desconhecido, recurso incompatível, política inexistente e condição falsa são negados. Define motivos internos; o cliente recebe erro genérico de permissão, não detalhes de credenciais.

### policy.decorators.ts

`@Public()` marca uma exceção explícita.

`@RequirePolicies(...)` declara ação/recurso. Múltiplos requisitos são AND: todos devem permitir. Lista vazia não autoriza.

Exemplo:

```ts
@RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.USER })
@Get()
async findAll() { /* controller */ }
```

O controller declara **qual operação** realiza; os papéis que a permitem ficam no registry, não espalhados nas rotas.

### policies.guard.ts

Estende o guard JWT existente. Usa Reflector para metadados, executa Passport/sessão antes da política e constrói contexto com dados do servidor. Negação por padrão, mesmo com usuário administrador.

A combinação Public + RequirePolicies é inválida e gera 403, evitando uma exceção pública esconder uma política configurada.

Perfil e logout atuais não recebem alvo arbitrário: usam o usuário/sid autenticados. Esse contexto próprio **não é um carregador genérico de recursos**. Na #5, endpoints que revogam uma sessão indicada por ID precisarão carregar o alvo e validar seu dono real, não assumir que qualquer ID pertence ao usuário.

### authorization.module.ts e AppModule

O módulo importa a autenticação e registra PoliciesGuard por APP_GUARD, aplicado globalmente. AppModule importa AuthorizationModule; o throttling global existente é preservado.

Controllers migrados: auth, users, disciplines, attendance, grades e meetings. Removidas as checagens locais redundantes de JWT/papéis dessas rotas. Guards adicionais de usuários (excluir próprio usuário da listagem e impedir operações administrativas sobre si) foram mantidos e executam depois da autorização global.

RolesGuard/Role decorator antigos permanecem como código legado, mas não são usados pelos controllers atuais. Não usar esse caminho para novas rotas.

## Exceções públicas atuais

Somente quatro handlers de controllers são públicos:

1. AppController.getHello — endpoint raiz.
2. AuthController.login — LocalStrategy ainda valida senha.
3. AuthController.refresh — serviço ainda valida e consome refresh token.
4. UsersController.create — serviço continua impondo CUSTOMER.

Swagger/OpenAPI é montado por middleware no bootstrap, fora dos handlers Nest cobertos por esse teste de metadados. A exposição da documentação em produção precisa de decisão própria; não afirmar que o guard global protege automaticamente esse middleware.

## Como testamos

- Testes parametrizados de sucesso e negação para cada uma das 26 definições.
- Negação para política desconhecida, atributos incompatíveis, papéis ausentes/desconhecidos e sujeito sem sessão.
- Verificação de ausência de identificadores duplicados no registry.
- Cobertura dos 30 handlers atuais: exceção pública permitida ou requisito registrado obrigatório.
- HTTP real com Passport/JWT/MongoDB e guard global: 401 anônimo, 403 sem permissão, aprovação de administrador quando há política, negação mesmo para administrador em rota sem requisito/política.
- Lista vazia, múltiplos requisitos AND e conflito Public + política.
- Todos os cenários de sessão da #2 repetidos com o guard global, incluindo logout e concorrência.

| Validação | Resultado |
|---|---|
| npm test -- --runInBand | 12 suítes, 121 testes aprovados |
| npm run test:sessions com MongoDB isolado | 12 testes integração/HTTP aprovados |
| npm run test:e2e -- --runInBand | 1 E2E existente aprovado |
| npm run build | Aprovado |
| npm run lint | Aprovado |

Os testes de integração montam módulo focado em autenticação/autorização, não todos os módulos/email da aplicação. MongoDB usa banco único sessions_test_* e container isolado, removidos ao final. Não houve alteração em banco da aplicação.

A lista de controllers do teste de cobertura deve ser atualizada ao adicionar módulos. Mesmo se esquecida, o guard global continua negando rotas não anotadas em execução.

## O que não foi feito

- Isolamento entre organizações, carregamento geral de atributos e filtros de consulta: #4.
- Gestão administrativa de sessões: #5.
- Auditoria persistente completa e cenários extras: #6.
- Limitador de quantidade de sessões e reforços adicionais: planejamento conjunto após #6.
- CRUDs comerciais, alteração de nomes/valores e domínio de produtos/estoque: depois da etapa de segurança.
- Pipeline CI remoto, revisão externa, ensaio de produção e auditoria independente. Testes locais não comprovam segurança absoluta.

## Exercício para aprender

1. Siga UsersController.findAll: requisito USER:LIST → registry → SYSTEM_ADMIN.
2. Compare com profile: o papel conhecido não basta; ownerId deve coincidir com o sujeito.
3. Explique por que um administrador recebe 403 numa rota sem requisito.
4. Diferencie uma rota pública de uma rota sem política: a primeira precisa de marcação explícita; a segunda é negada.
5. Entenda por que PBAC ainda não impede acesso entre organizações por si só: precisamos dos atributos e filtros da #4.
6. Leia os testes HTTP junto com a regra AND: permitir uma das políticas não basta quando outra é negada.

## Próximo passo

Publicar a branch e PR para revisão, registrar evidências e integrar após aceite. Não encerrar a #3 apenas por este documento. Depois seguir a #4 conforme autorização do responsável.
