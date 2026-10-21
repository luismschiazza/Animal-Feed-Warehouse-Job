# Issue #6 — Auditoria geral: estudo e execução

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/6
Branch: `feat/issue-6-security-audit`, a partir de main `ac77e50`.
Estado: implementação e validação local; integração e encerramento serão registrados após aceite na main.

## 1. Problema e limites do escopo

As issues #2–#5 implementaram sessões independentes, rotação/replay, PBAC/ABAC e revogação durável. A #5 já grava `auth_session_revocations`, mas não existia histórico persistente geral de login, falhas de autenticação, refresh e decisões de autorização nem consulta protegida desse histórico.

Encontramos também logs auxiliares que expunham segredo JWT gerado, credenciais de seed, email/papéis do usuário, destinatário/assunto de email e stack SMTP. Esses pontos foram corrigidos sem executar os comandos de geração/seed ou enviar emails reais.

O aceite real da #6 é: eventos sensíveis consultáveis e sucesso/negação de cada política relevante testados. A entrega NÃO implementa limites de sessões, novas políticas de abuso/MFA, CI/CD, implantação, backups ou gestão de funcionários. Essas são as quatro próximas issues, somente planejadas nesta execução.

Instalação da loja continua nova. Nenhum banco/conta real foi modificado ou provisionado.

## 2. Arquitetura escolhida

```text
HTTP → contexto de correlação gerado no servidor
     → Passport/sessão → guard PBAC/ABAC → serviço revalida
     → eventos gerais em security_audit_events
     → regras/eventos efetivos de revogação em auth_session_revocations

GET auditoria → sessão/conta/vínculo atuais + política
             → filtros obrigatórios por identidade OU organização
             → projeção positiva → união das duas fontes → paginação
```

### Duas fontes, sem copiar revogações

- `security_audit_events`: fatos de login/refresh, autenticação e decisões, com resultado allowed/denied/error.
- `auth_session_revocations`: permanece autoritativa, permanente e sem TTL. Sua inserção continua sendo o efeito de revogação E seu evento atômico. Consulta usa source=revocation e result=effective.
- Não fazemos uma segunda escrita obrigatória de cópia da revogação para o histórico geral. Isso reabriria a inconsistência entre efeito e log resolvida na #5.
- Replay/cap/logout/revogações são consultáveis diretamente pela união segura das fontes. Acrescentamos requestId opcional aos novos documentos canônicos, sem modificar regras antigas nem inventar backfill.

Nenhuma transação multi-documento ou replica set foi introduzida. Persistência/concorrência foi exercitada em MongoDB 8 standalone, incluindo servidor separado com autenticação habilitada para comprovar ACLs.

### Modelo mínimo e proteção de dados

Evento geral contém evento, resultado, fase, horário UTC, requestId, ator, sessão pública, organização/vínculo quando verificados, papéis efetivos conhecidos, recurso/ação e identificador de alvo permitido. Método e IP observado pelo servidor são metadados opcionais.

Não armazenamos senha, JWT, refresh token, verificador/hash, histórico de tokens consumidos, email/nome, body, query/URL completos, headers, User-Agent ou mensagens/stacks arbitrários. Motivos são códigos fixos accepted/rejected/unavailable. A entrada não é “sanitizada por blacklist”: construímos um novo objeto com campos permitidos.

Identidade de JWT inválido NÃO é atribuída ao ator alegado nas claims. Falha de credencial fica anônima; não registrar email enviado como prova de identidade. Organização solicitada no login só vira contexto após validação do vínculo. Eventos anônimos ficam acessíveis somente ao operador com credencial MongoDB de leitura e exportação explícita, não ao administrador de qualquer empresa.

IP não é credencial. Aceitamos apenas formato IP canônico observado por req.ip; a instalação precisa definir proxies confiáveis conscientemente. Não interpretamos X-Forwarded-For livre como autoridade.

### Correlação e fases

AsyncLocalStorage mantém um UUID criado no servidor durante cada requisição. `X-Request-Id` de resposta permite localizar os eventos; cabeçalho homônimo fornecido pelo cliente não escolhe esse valor. Requisições concorrentes não compartilham contexto. Erros anteriores ao middleware recebem contexto no filtro.

Fases auth, guard, service e http são observações distintas, NÃO eventos “exactly once” por tentativa. Um acesso negado pode gerar decisão de serviço, decisão de guard e falha HTTP, todas correlacionadas. Não contar esses registros como três logins independentes. Fora do HTTP, chamadas internas precisam executar no mesmo AuditContext para correlação de múltiplas observações; caso contrário cada registro recebe identificador próprio.

`authorization:allowed` significa **política permitiu**, não “a alteração comercial foi concluída”. Falha posterior gera observação HTTP de erro/negação. Esta entrega não é um log transacional universal de toda mutação futura.

## 3. Comportamento de falhas e concorrência

### Gravação durável e falha fechada

Escritas aguardam majority+journal. Login/refresh só devolvem credenciais depois da confirmação do evento de sucesso; decisões de guard/serviço são persistidas antes de prosseguir para o handler/efeito protegido. Falha de escrita retorna 503 genérico, não concede acesso e não despeja o erro original do MongoDB nos logs.

Não existe transação entre criação/rotação da sessão e evento geral. Se login criou sessão mas auditoria falhou, o par NÃO é retornado; pode sobrar sessão inacessível ao cliente até expiração/revogação. Refresh pode ter sido consumido e exigir login novo. Não prometemos rollback ou recuperação do segredo anterior.

Timeout/perda de conexão pode tornar uma confirmação incerta: a escrita pode existir, mesmo sem resposta de sucesso. Revogação autoritativa continua com efeito/log no MESMO documento; nenhuma regra é apagada para “compensar” uma falha de auditoria geral.

Falha de consulta de auditoria não retorna dados parciais como sucesso: 503. Não há fallback em memória ou fila fire-and-forget. Em indisponibilidade total não é possível garantir que a própria falha seja persistida no mesmo banco indisponível. O filtro emite apenas sinal estático de erro, status e correlação, sem objeto/stack/dados sensíveis; monitoramento externo é dependência operacional futura.

### Estado atual e leituras

- AuthService revalida conta/sessão/vínculo; guard e serviços conservam o modelo deny-by-default.
- Serviços de escopo e sessões registram decisões também em chamadas internas, usando ator após revalidação. Falha anterior à comprovação fica sem ator, em vez de atribuir dados forjados.
- MongooseConfig força primary para metadados de segurança, mesmo se a URI pedir secondary. Consultas da auditoria/revogação também explicitam primary.
- Não é snapshot transacional: mudança de papel/revogação não cancela uma ação já autorizada.
- Concorrência conserva CAS/replay estrito da #2; histórico geral não altera a decisão sobre segredo incorreto, limite de rotações ou expiração absoluta.

## 4. Consultas e isolamento

| Rota (antes do prefixo global /api) | Política |
|---|---|
| GET /audit/own-events | OWN_AUDIT_EVENT:LIST; identidade autenticada, entre seus contextos |
| GET /audit/organization-events | AUDIT_EVENT:LIST; AUDITOR ou SYSTEM_ADMIN do vínculo ativo, somente organização atual |

MANAGER e ORGANIZATION_OWNER sozinhos NÃO recebem consulta administrativa. Não há bypass global. Novo recurso possui somente LIST, não CREATE/UPDATE/DELETE de eventos.

O cliente só informa limit (padrão 25, máximo 100) e before. DTO recusa userId/organizationId/filtros extras. Identidade, organização e papéis são recarregados; header de organização não troca contexto. QueryService revalida a política também sem controller.

- Fontes são filtradas ANTES de união, projeção e paginação.
- Cursor composto `ObjectId.source` resolve empate de _id entre coleções; é posição pública, não credencial. Ordenação por _id/source, não promessa de cronologia global ou snapshot estável.
- Projeção positiva e mapper explícito excluem dados brutos, inclusive campos indevidos inseridos diretamente no banco no teste de segurança.
- Na empresa A, revogação de sessão A feita pelo próprio titular logado em B NÃO expõe o identificador de B nem o SID do ator em B. Alvos de sessão própria são omitidos dos eventos gerais para não vazar referência de outro contexto no stream do ator.
- Revogação user-wide é visível no stream do ator/usuário e, quando aplicável, da empresa em que ele atuou; não replica seu histórico pessoal em todas as empresas.
- Stream próprio inclui eventos atribuídos à identidade e revogações direcionadas a ela; não é relatório completo de todas as regras organization-wide que potencialmente a afetaram. Auditor empresarial/operador consulta esses eventos por organização.
- Eventos anônimos não entram em consulta de empresa/usuário por alegação de email/tenant na requisição.

A aplicação real usa ResponseTransformInterceptor e prefixo /api; respostas de auditoria são envolvidas em `{ payload, message }`. Os testes focados inspecionam o retorno direto `{ items, nextCursor }`; o smoke do AppModule real valida o envelope existente, sem alterar silenciosamente esse contrato legado.

## 5. Retenção, integridade e operação

Política técnica inicial explícita: **conservar integralmente as duas fontes, sem TTL, job de purga ou endpoint de exclusão**. Não inventar prazo legal. Antes de implantar, responsável deve definir prazo jurídico/negocial, acesso e armazenamento proporcional. Enquanto isso, o custo cresce; acompanhar capacidade e volume.

Mesmo que se arquive, NÃO remover regras autoritativas ainda aplicáveis. Apagá-las pode reativar sessões. Nesta entrega nenhum comando possui purga, exclusão de regra ou alteração de evento. TTL de auth_sessions não remove auditoria.

### Inicialização e credenciais

As duas schemas desabilitam criação automática de coleção/índice em TODOS os ambientes. Isso não depende de NODE_ENV nem da ordem em que dotenv carrega variáveis: schema é definida durante imports, antes de certas configurações de bootstrap. Operador prepara conscientemente antes da API (inclusive local/dev):

```text
AUDIT_MONGO_URL=<banco escolhido pelo operador> npm run audit:initialize
```

O comando não lê .env nem usa MONGO_URL por fallback. Cria apenas as duas coleções/índices declarados, não apaga eventos/índices existentes e não faz reparo destrutivo. Em conflito, revisar manualmente. Repetição idempotente exercitada em banco descartável.

Startup verifica índices declarados (inclusive unicidade parcial de revogações) e rejeita TTL nas duas fontes. Falta/incompatibilidade bloqueia inicialização em vez de aceitar sem garantias. Verificação é no startup, não vigilância contínua contra operador privilegiado.

Depois, credencial da API deve ter **find/insert/listIndexes**, SEM update/remove/drop/createIndex, nessas DUAS coleções. Outros modelos exigem privilégios separados, por coleção. Não combinar com readWrite/dbOwner/root de banco inteiro: permissões MongoDB são aditivas e anulariam essa restrição. Credencial do exportador precisa apenas find nas duas fontes. Inicializador é identidade operacional distinta, não uma rota da API.

Exemplo para operador estudar (NÃO executado em banco real):
```js
// Substituir DB com ambiente escolhido conscientemente; não usar senha em histórico de shell.
db.createRole({
  role: 'warehouse_audit_writer', roles: [],
  privileges: ['security_audit_events', 'auth_session_revocations'].map(collection => ({
    resource: { db: 'DB', collection }, actions: ['find', 'insert', 'listIndexes'],
  })),
});
```

Testamos permissões reais em MongoDB autenticado: inserção/leitura permitidas, alteração/exclusão/drop/criação de TTL negadas; leitor não insere. Isso não configura as credenciais da futura produção. Imutabilidade Mongoose sozinha não substitui ACL do MongoDB; operador root pode adulterar qualquer dado. Assinatura externa/WORM, gestão de chaves e monitoramento de integridade são avaliações operacionais futuras, não garantias existentes.

### Arquivamento somente leitura

```text
AUDIT_MONGO_URL=<URI explícita com leitor>
AUDIT_SCOPE=organization | user | anonymous
AUDIT_SCOPE_ID=<ObjectId obrigatório para organization/user>
AUDIT_EXPORT_PATH=<arquivo novo fora do Git>
npm run audit:export
```

Exporta JSONL paginado, memória limitada, com manifest de contagem/SHA-256 e deletionPerformed=false. Arquivos criados exclusivamente (wx), sem sobrescrever; sync antes de concluir. Usa modo 0600 em sistemas POSIX; no Windows verificar ACL da pasta/arquivo, pois esse modo não garante isolamento NTFS.

- Teste de integração exporta eventos reais, confere hash/contagem, recusa sobrescrita e confirma que regra continua bloqueando após exportação.
- CLI de exportação também exercitada em banco vazio isolado; inicializador executado duas vezes no mesmo sandbox.
- Falha pode deixar arquivo parcial/manifest ausente: comando retorna erro; não tratar arquivo sem confirmação/manifest validado como arquivo completo. Guardar/quarentenar e investigar, não sobrescrever automaticamente.
- Exportação não é backup consistente nem snapshot transacional entre fontes. Relógios/IDs e gravações concorrentes podem afetar o recorte; agendar janela controlada se necessário.
- Hash detecta corrupção quando comparado a manifest confiável, NÃO prova inviolabilidade se atacante também altera o manifest. Guardar manifest/arquivo com acesso restrito e cópia independente.
- Criptografia, cópia externa, restauração ensaiada, alertas de disco e retenção legal pertencem ao planejamento de ambientes/recuperação. Não há promessa de recuperação de produção nesta issue.

## 6. Arquivos e responsabilidades

| Arquivo/grupo | Responsabilidade |
|---|---|
| common/audit/security-audit.schema.ts | Modelo imutável, campos mínimos e índices sem TTL |
| common/audit/audit-context.service.ts | Contexto AsyncLocalStorage e correlação HTTP de servidor |
| common/audit/security-audit.service.ts | Escrita durável/redação por allowlist e leitura unificada filtrada |
| common/audit/security-exception.filter.ts | Observação HTTP de falhas e erros 5xx sem diagnósticos sensíveis |
| common/audit/security-audit.module.ts | DI global, middleware e filtro de exceção |
| common/audit/audit-query.service.ts | Revalidação de identidade/vínculo/política antes de consultar |
| common/audit/audit.controller.ts | Dois GETs e DTO de paginação restrita |
| common/audit/audit-indexes.ts | Startup recusa índices ausentes/inseguros/TTL sem auto-reparo |
| common/audit/audit-export.ts | Exportação paginada somente leitura e manifest |
| commands/audit-*.script.ts | Operação explícita por ambiente, sem fallback ao banco da aplicação |
| authorization/{types,registry,guard,scoped-resources.service} | Políticas novas e observações de autorização no guard/serviço |
| auth/{module,auth-sessions.module,services} | DI, login/refresh auditados e gestão de sessões observada |
| auth/schemas/session-revocation.schema.ts | Sem mudar semântica: requestId adicional e DDL sempre controlada pelo operador |
| database/configs/mongoose.config.ts | Primary explícito para metadados autoritativos |
| commands/generate-jwt-secret, seed e logs auxiliares | Elimina segredo/credenciais/PII/stack dos logs encontrados |
| security-audit.spec.ts | Unidade: redação, contexto concorrente, falhas, configuração e logs |
| test/sessions.integration-spec.ts | Persistência/HTTP real, isolamento, falhas, índices, arquivo e regressões |
| test/security-root.smoke.ts | AppModule real, contrato com prefixo/envelope e negação pessoal |
| test/audit-operations.smoke.ts | ACL real em MongoDB com autenticação habilitada |

## 7. Conceitos e exemplos didáticos

### Autenticação versus autorização versus resultado da ação

```ts
// Autenticação: identidade/sessão provadas, não dados alegados no body.
const identity = await auth.validateSession(subject.id, subject.sessionId);
// Autorização: atributos reais + política; não implica que a escrita comercial deu certo.
const decision = engine.evaluate(requirement, context);
await audit.record(AuditEvent.AUTHORIZATION,
  decision.allowed ? 'allowed' : 'denied', 'service', identity, requirement);
```

### Allowlist é mais segura do que esconder dois campos

```ts
// NÃO: audit.save({ ...request.body, error });
// SIM: construir campos mínimos, com enums e identidade validada.
await audit.record(AuditEvent.LOGIN, 'denied', 'auth');
// Não sabemos quem está tentando entrar: não inventar ator a partir do email alegado.
```

### Política NestJS explícita

```ts
@RequirePolicies({ resource: PolicyResource.AUDIT_EVENT, action: PolicyAction.LIST })
@Get('organization-events')
list(@Req() req, @Query() page: ListAuditDto) {
  return queries.list(PolicyResource.AUDIT_EVENT, req.user, page.limit, page.before);
}
// O serviço novamente exige vínculo ativo e papel AUDITOR/SYSTEM_ADMIN.
```

### Filtro de organização antes de paginar no MongoDB

```js
// Organização vem do contexto validado, nunca de req.query.organizationId.
{ $match: { organizationId: authenticatedOrganizationId } }
{ $sort: { _id: -1 } }
{ $limit: 26 } // página de 25 + indicador de próxima página
```

A união aplica filtro equivalente também às revogações. Limitar primeiro e filtrar depois causaria páginas vazias e mistura indevida entre organizações.

### Atomicidade, durabilidade e integridade não são sinônimos

- Atomicidade: o documento de regra/evento canônico é inserido inteiro ou não.
- Durabilidade: confirmação majority/journal reduz risco de perda após reconhecimento; depende do servidor/storage.
- Integridade operacional: credenciais sem update/delete e arquivo protegido dificultam adulteração. Não impede operador root nem comprova segurança absoluta.

## 8. Validação e reprodução

Validação final na feature branch: **218 unitários / 19 suítes, 65 HTTP/sessões/PBAC/ABAC, 13 vínculos/provisionamento, 1 E2E existente**, build/lint/TypeScript incluindo testes/diff --check aprovados. Adicionalmente: smoke do AppModule REAL e smoke de ACLs em MongoDB autenticado, incluindo o CLI exportador com usuário que possui SOMENTE find. Não são testes simulados de persistência.

Um aviso de handle pendente na primeira rodada unitária levou à revisão: o modelo usado apenas para validar schema foi clonado sem autoCreate/autoIndex, sem abrir operações de conexão. Unidade com --detectOpenHandles e rodada completa posterior passaram sem o aviso. A revisão também explicitou DDL sempre desabilitada nas duas schemas e no modelo do CLI leitor, evitando depender da ordem de carregamento de NODE_ENV/dotenv.

Comandos operacionais: inicializador executado duas vezes no mesmo banco sandbox, sem apagar dados; CLI vazio e CLI com leitor restrito exercitados. Integração/encerramento dependem de repetir o marco na main.

```text
npm test -- --runInBand
SESSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:<porta-isolada> npm run test:sessions
ABAC_TEST_MONGO_URL=mongodb://127.0.0.1:<porta-isolada> npm run test:abac
SESSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:<porta-isolada> npm run test:security-root
AUDIT_TEST_ADMIN_URL=<MongoDB LOCAL descartável COM autenticação> npm run test:audit-operations
npm run test:e2e -- --runInBand
npm run build
npm run lint
npx tsc --noEmit --incremental false -p tsconfig.json
```

Suítes usam bancos únicos sessions_test_*, abac_test_*, audit_root_test_* e audit_acl_test_*. A suíte ACL cria/remove apenas usuários/papéis do seu banco gerado, não altera o admin fornecido. CLI smoke usa banco reservado audit_cli_test_issue6, removido ao final. Containers dedicados são removidos depois da validação final. Não passar URI da aplicação aos testes.

Matriz: 34 políticas têm casos positivos/negativos; USER:UPDATE/DELETE têm apenas negação intencional, inclusive para SYSTEM_ADMIN, pois conta global compartilhada não é editável por empresa. Teste de integração persiste decisões de todas as definições. HTTP repete CRUDs/IDOR/locks, A/B/pessoal, atuais/others/all/admin, replay/CAS/cap/expiração e bloqueio de credenciais após revogação.

Novos cenários: identidade não comprovada não atribuída, correlação concorrente, consulta por AUDITOR/revogação de papel, tentativa de troca de contexto, projeção de campos indevidos, cursor misto, regra durável após remoção da sessão, rejeição REAL de insert por validador MongoDB, falha de leitura, logs redigidos, arquivo/hash, índices inseguros e ACL real.

## 9. Limitações e continuidade

- Não há CI remoto, benchmark, failover/storage crash ou auditoria externa de produção. Resultados locais, não certificação.
- Não registrar evento no próprio banco indisponível é limitação física; indisponibilidade bloqueia acesso e precisa de alerta externo.
- Auditoria síncrona custa I/O e pode ampliar DoS/armazenamento por tentativas anônimas. Definir proteção de abuso com o responsável na próxima issue; sem inventar novos limites nesta entrega.
- Prazos legais, exclusão/anonymização aprovada, WORM, criptografia/backups e restauração requerem operação futura. Não apagar regra autoritativa aplicável.
- Swagger é middleware fora dos guards; revisar exposição em staging/prod na issue de ambientes. Esta issue não cria autenticação fictícia para Swagger.
- Não são inventados eventos históricos anteriores à implantação. Política/snapshot não são prova de entrega da resposta ou transação comercial.
- Após #6: quatro issues de planejamento (contas/sessões Ready, demais Backlog); nenhuma dessas quatro implementada. CRUDs comerciais continuam posteriores às fundações e ao planejamento aprovado.
