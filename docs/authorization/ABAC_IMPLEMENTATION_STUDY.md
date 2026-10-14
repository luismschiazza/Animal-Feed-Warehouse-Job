# Issue #4 — ABAC e isolamento por organização

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/4
PR: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/9

## Estado e cenário confirmado

Implementação completa para os recursos atualmente existentes, com validação local. A integração e seu resultado são registrados na PR/issue. Esta entrega não significa que os CRUDs comerciais ou a preparação de produção estejam concluídos.

O responsável confirmou que a loja nunca teve sistema: instalação nova, banco vazio, sem dados reais a migrar. O domínio escolar é código reaproveitado, não histórico da cliente. Não converter/importar seus registros nem executar os seeders escolares no banco da loja. Dados sem escopo continuam inacessíveis. Nenhum banco da aplicação foi alterado nesta execução.

## O que é PBAC e ABAC

PBAC centraliza as políticas. ABAC avalia atributos confiáveis do sujeito, recurso e contexto. Ser MANAGER em A não permite acessar B. Ser proprietário também não contorna organização, papel ou estado. SYSTEM_ADMIN não possui bypass entre organizações.

## 1. Organizações e vínculos

- `Organization`: nome limitado, estado active/suspended e timestamps.
- `OrganizationMembership`: organizationId/userId BSON ObjectId, índice único por par, estados invited/active/suspended/revoked e papéis específicos da organização.
- Convite não concede acesso. Papéis precisam ser conhecidos, não vazios, únicos e limitados ao enum.
- `OrganizationAccessService.requireActiveMembership` valida organização e vínculo exatos/ativos e papéis persistidos. Erro genérico 403, sem matrícula automática ou bypass administrativo.
- A primeira integração encontrou referências persistidas como strings: corrigidas para `SchemaTypes.ObjectId`, com testes de tipo BSON e índices reais.

O resolver de vínculo não autentica sozinho. Somente usar identidade validada pelo servidor.

## 2. Conta, sessão e organização

`AccountStatus`: pending/active/suspended. Legado sem estado explícito não vira ativo. Cadastro público cria apenas identidade pessoal active/CUSTOMER; não aceita concessão de organização, papéis ou status pelo cliente. Active não equivale a email verificado.

Login aceita organizationId candidato e confirma vínculo/organização antes de criar sessão. Sem organização, sessão pessoal CUSTOMER, mesmo com papéis administrativos globais antigos. Não escolhe uma empresa automaticamente.

Sessão persiste organização BSON ObjectId, imutável nas escritas normais Mongoose. JWT deve coincidir com o registro. Trocar empresa exige novo login. Acesso e refresh recarregam conta, vínculo e papéis; headers/claims não concedem privilégios. Conta suspensa bloqueia todos os contextos; vínculo/organização inválidos bloqueiam o contexto correspondente.

Perfil/logout pessoais continuam disponíveis com contexto válido. Uma sessão empresarial com vínculo inválido também não autentica seu perfil/logout; conta ativa pode fazer login pessoal. Gestão de outras sessões é #5.

## 3. Atributos e filtros obrigatórios

Arquivos centrais:
- `src/common/authorization/scoped-resources.service.ts`
- `src/common/authorization/scoped-resources.module.ts`
- `src/common/authorization/tenant-schema.ts`
- `src/common/authorization/policies.guard.ts`

Todos os serviços operacionais existentes delegam à camada de escopo. O guard carrega atributos reais; o serviço revalida sessão, conta, organização, vínculo, papéis e política. Proteger só o controller não seria suficiente.

```text
Antes: findById(id)                         -> acesso global
Agora: findOne({_id: id, organizationId})   -> ID e organização juntos
```

Listagens usam organização obrigatória; leitura/alteração/exclusão não utilizam busca global de recursos. Dados sem metadados válidos não são habilitados por uma organização padrão. As únicas leituras globais de identidade restantes são internas à autenticação/registro (email/ID), não às rotas administrativas.

Cada recurso tem organizationId, ownerId, createdBy e accessState. Organização/dono/criador são server-side e imutáveis nas escritas normais Mongoose. `recordedBy` também é protegido. Criação atribui o ator autenticado; DTO não pode escolher dono/organização/criador/estado. Não há transferência de propriedade nesta entrega.

`accessState`: active ou locked. Leitura autorizada aceita ambos; alteração/exclusão somente active. Não existe endpoint público para desbloqueio. Estado é uma restrição adicional, nunca uma concessão de privilégios. O proprietário precisa dos papéis explicitamente permitidos; nos módulos escolares atuais, MANAGER/SYSTEM_ADMIN. CUSTOMER proprietário não recebe CRUD por isso.

Na etapa 2 os dados ficavam temporariamente negados por falta do loader. Esse bloqueio intermediário foi substituído por autorização real: operações legítimas funcionam, operações fora do escopo são negadas.

## 4. Referências e notificações

Aluno/participantes precisam de conta e vínculo ativos na mesma organização. Disciplina precisa ser da organização autorizada e estar ativa ao criar/alterar referência. IDs externos são negados em criação e atualização. Não há populate global nestes caminhos. Arrays de participantes são limitados a 100.

Conflitos de reuniões e contagens de frequência também são filtrados por organização. Notificações conservam o ator autenticado, revalidam sua autorização/sessão e recarregam registro e destinatários; não confiam nas referências do evento. Relações inválidas/suspensas ou IDs externos impedem envio. Dados de B não entram na agregação de A. Logs desses listeners não incluem emails ou conteúdo de registros. Os testes usam mailer falso: nenhum email real enviado.

## 5. Contas compartilhadas

Listagem/leitura administrativa de usuários exige SYSTEM_ADMIN no vínculo atual e somente retorna contas vinculadas àquela organização. Resposta limitada a perfil, estado e papéis do vínculo, nunca senha/hash ou privilégios globais.

PATCH/DELETE de contas globais são negados tanto pela política quanto por UsersService, mesmo para administrador/proprietário da empresa. Administrar A não permite trocar credenciais ou apagar identidade também usada em B. A administração futura de vínculos será uma operação separada; não reinterpretar exclusão de conta como remoção de vínculo silenciosamente.

## 6. Primeiro acesso — banco novo

Comando disponível: `npm run bootstrap:organization`.

Executar SOMENTE por operador autorizado, com API parada e banco intencionalmente vazio. Não foi executado no banco da aplicação; apenas em banco Docker isolado de teste.

Variáveis de ambiente (não colocar senhas no Git ou em argumentos/comandos compartilhados):
- MONGO_URL: banco novo escolhido conscientemente.
- BOOTSTRAP_ORGANIZATION_NAME
- BOOTSTRAP_ADMIN_NAME
- BOOTSTRAP_ADMIN_EMAIL
- BOOTSTRAP_ADMIN_PASSWORD: mínimo 12 caracteres, máximo 72 bytes UTF-8 (limite bcrypt).

Cria identidade active/CUSTOMER, organização active e vínculo active com ORGANIZATION_OWNER, MANAGER e SYSTEM_ADMIN. Esses papéis são exclusivamente desse vínculo; login pessoal continua CUSTOMER e não ganha outras empresas. Senha bcrypt; saída somente IDs e papéis, sem senha/hash/URL.

Marcador `_id` único impede duas inicializações concorrentes. Banco não vazio ou já inicializado é recusado. Não atribui dados antigos a uma empresa. Em falha tenta remover apenas IDs reservados por sua própria execução. Isso não é uma transação multi-documento: interrupção abrupta/falha de rollback exige inspeção manual; marcador persistente impede repetição automática. Não apagar marcador nem dados existentes para forçar o comando. Após sucesso, remover variáveis secretas do ambiente e fazer login selecionando o organizationId retornado.

Funcionários/vínculos adicionais serão provisionados de forma confiável, nunca por autoinscrição administrativa pública. Não há CRUD comercial de organizações/membros nesta etapa de segurança.

## Validação local

| Verificação | Resultado |
|---|---|
| Unitários | 156 testes, 16 suítes |
| HTTP/sessões/PBAC/ABAC | 39 testes com MongoDB real |
| Organizações e provisionamento | 13 testes com MongoDB real |
| E2E existente | 1 aprovado |
| Build/lint/diff --check | Aprovados |
| Comando de provisionamento | 1 identidade/organização/vínculo em banco isolado; banco removido |

HTTP cobre CRUDs reais de usuários, disciplinas, notas, frequência e reuniões; IDs/headers estrangeiros; relações A/B; proprietário compartilhado entre A/B; bloqueio de estado; papéis atuais/forjados; dados sem escopo; sessão pessoal; conta/vínculo/organização inválidos. Listeners reais são exercitados com mailer falso, incluindo agregação A/B e destinatários externos. Provisionamento cobre configuração inválida, banco não vazio, repetição e concorrência.

Reproduzir em MongoDB descartável:
```text
ABAC_TEST_MONGO_URL=mongodb://127.0.0.1:<porta> npm run test:abac
SESSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:<porta> npm run test:sessions
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run lint
```

Somente bancos `abac_test_*`/`sessions_test_*` únicos são removidos. Nunca usar o banco real da aplicação nos testes. Não há CI remoto configurado: evidência de execução local, não auditoria de produção.

## Limites e próximos trabalhos

- Leituras de autorização são snapshots; suspensão concorrente não cancela retroativamente operação já autorizada. Filtros de ID+organização e estado na escrita continuam obrigatórios.
- Suspensão não revoga fisicamente todas as sessões; reativação pode restaurar tokens ainda vigentes. Revogação explícita será tratada na gestão de sessões.
- Refresh pode ser consumido antes da revalidação falhar, exigindo novo login. Não foi introduzida tolerância de replay.
- Imutabilidade Mongoose não impede operador privilegiado de alterar diretamente o banco. Produção precisa de credenciais de banco mínimas e revisão operacional.
- Horário/IP/dispositivo não têm regras arbitrárias de bloqueio: sessão/expiração são verificadas; dados de dispositivo permanecem descritivos. Não fingir identidade de dispositivo confiável.
- Swagger middleware fica fora da cobertura automática dos guards de controllers; exposição deve ser revisada na preparação/auditoria.
- Próximos: #5 gestão de sessões, #6 auditoria/testes, planejamento conjunto de reforços (incluindo limite de sessões), depois CRUDs comerciais com estas mesmas regras de escopo.
- Não prometer 100% de segurança nem usar esta conclusão para afirmar que o sistema comercial está pronto.

## Exercício de estudo

O mesmo usuário é dono de um registro em A e outro em B. Explique por que a sessão de A não altera B, mesmo com ownerId igual. Depois encontre no serviço o filtro de organizationId, a recarga dos papéis e a condição que impede alterar um recurso locked.
