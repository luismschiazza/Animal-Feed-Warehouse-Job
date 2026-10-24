# Animal Feed Warehouse API

API para a futura gestão de estoque, loja e depósito de rações, acessórios e produtos para pets. O projeto está sendo modernizado a partir de uma base NestJS existente.

> **Estado atual:** a fundação técnica, autenticação, usuários e modernização de papéis estão em desenvolvimento. Os módulos comerciais — produtos, estoque, compras, vendas, caixa e financeiro — ainda serão implementados. Não use a aplicação atual como um ERP/PDV pronto para produção.

## Objetivo do produto

Centralizar a operação de uma loja e depósito de rações:

- cadastro de produtos, marcas, categorias e unidades;
- controle de saldo por loja e depósito;
- entradas, saídas, ajustes, perdas e transferências;
- fornecedores, compras e recebimento de mercadorias;
- clientes, vendas e caixa;
- lotes, validade e alertas de estoque mínimo;
- relatórios, auditoria e, posteriormente, integração fiscal (NFe/NFC-e).

## Tecnologias

- [NestJS 11](https://nestjs.com/) e TypeScript;
- MongoDB e Mongoose;
- JWT, Passport e bcrypt;
- Swagger/OpenAPI;
- Jest e ESLint;
- Docker e Docker Compose.

## Autenticação e autorização

A API usa JWT com access token e refresh token. Cada login cria uma sessão independente em `auth_sessions`. O JWT inclui `sid`, validado no servidor a cada acesso. Logout revoga somente a sessão autenticada; refresh rotaciona a credencial atomicamente e reutilização comprovada revoga sua família.

Sessões têm duração absoluta de sete dias e limite de 1.000 rotações. O cliente deve coordenar um refresh por vez: chamadas concorrentes com o mesmo token podem revogar a sessão pela política estrita de replay. Após implantar esta mudança, tokens legados sem `sid` exigem novo login; não há fallback para o modelo antigo.

A implementação foi validada com MongoDB real e testes HTTP. Detalhes e reprodução dos testes: [`docs/authorization/DEVICE_SESSIONS_IMPLEMENTATION.md`](docs/authorization/DEVICE_SESSIONS_IMPLEMENTATION.md).

A infraestrutura PBAC usa um guard global: somente rotas explicitamente públicas dispensam JWT; toda outra rota exige sessão ativa e política registrada. Ausência de política é negada, inclusive para administrador. Consulte [PBAC — implementação e estudo](docs/authorization/PBAC_IMPLEMENTATION_STUDY.md). O isolamento ABAC por organização está implementado para os recursos atuais na #4.

### ABAC por organização — PR #9

Nesta branch, login aceita `organizationId` opcional e exige vínculo ativo. Sem organização, a sessão é pessoal (`organization_id: null`), sem privilégios empresariais derivados dos papéis globais antigos. Conta, organização e vínculo são revalidados no servidor.

Guard e serviços carregam atributos confiáveis e aplicam filtros por organização em listas, leitura, alteração e exclusão. Referências e notificações são validadas no mesmo escopo; proprietário não contorna papel ou estado. Administradores empresariais não podem alterar/excluir contas globais compartilhadas.

**Instalação nova:** a loja começa com banco vazio. O primeiro acesso será criado conscientemente pelo operador com `npm run bootstrap:organization`, com a API parada e as variáveis `BOOTSTRAP_*` configuradas. O comando recusa banco não vazio/já inicializado e não concede privilégios globais ou a outras empresas. Não executar seeders escolares. Nenhum provisionamento real foi feito nesta execução. Instruções e limites: [ABAC — implementação e estudo](docs/authorization/ABAC_IMPLEMENTATION_STUDY.md).

### Configuração de limites de sessões — #16 / 12.1

`GET/PATCH /api/auth/organization-session-limit`: SYSTEM_ADMIN do vínculo ativo consulta/altera somente a organização da sessão. Padrão empresarial **3 por usuário/organização**; faixa técnica 1..100 e atualização com `expectedVersion`. Contexto pessoal não herda esse valor e permanece sem política numérica definida.

**Escopo histórico da #16:** somente configuração, sem revogação na redução. A admissão da #17 está implementada e revisada nesta branch, com PR autorizada e merge pendente de aprovação (seção abaixo); substituição da #18 NÃO implementada. Revisões append-only unem valor e recibo de auditoria; leitura primary/majority sem cache. Antes da primeira API desta versão, operador executa `session-limits:initialize` com `SESSION_LIMITS_MONGO_URL` explícita e credencial separada. Runtime: find/insert/listIndexes nessa coleção, sem update/delete/TTL/DDL. Não usar banco real durante testes. Contrato, limites e falhas: [estudo #16](docs/authorization/SESSION_LIMIT_CONFIGURATION_STUDY.md).

### Admissão atômica — #17 / 12.2 (PR #26 aberta; merge depende de aprovação)

Novos logins organizacionais respeitam o limite por identidade/organização entre instâncias. Transação MongoDB snapshot/majority/journal serializa admissão, configuração e revogação; conta sessões realmente ativas com as regras autoritativas, não um contador separado. No limite: **409**, sem credenciais/desafio de substituição. Redução preserva sessões e bloqueia novas admissões até haver capacidade. Pessoal permanece independente, sem quota numérica aprovada/fallback empresarial.

**Replica set obrigatório.** Standalone (inclusive Compose antigo sem replica set) falha fechado; não há fallback inseguro. Em rollout, drenar/parar escritores antigos E retirar permissões das identidades legadas; identidade runtime nova não pode ser entregue a binários/jobs antigos. Só parar processos ou trocar senha não é barreira suficiente. Sem rolling update misto/rollback automático pré-protocolo; veja o runbook da revisão. Em instalação realmente vazia, executar o bootstrap empresarial deliberado **antes** de criar o documento de coordenação, pois bootstrap recusa banco com dados. Após provisionamento, inicializar auditoria/configuração conforme instruções existentes e executar `npm run session-admission:initialize` com `SESSION_ADMISSION_MONGO_URL` explícita e credencial operacional separada. Nada disso foi executado em banco real.

Runtime precisa find/update/listIndexes em `session_serialization` (sem insert/delete/DDL/TTL), além dos privilégios anteriores por coleção. Journals continuam append-only. Sequência de coordenação não é contador de capacidade e nunca deve ser zerada; perda exige recuperação coerente. Relógio MongoDB e watermark persistido são verificados JUNTO da sessão em um comando snapshot; não há assertClock separado da leitura. Sequência ordena nascimento/cortes no mesmo milissegundo. JWT/infra ainda exigem disciplina de relógios.

Abort/crash pré-commit não deixa reserva durável. Commit com resposta perdida ou falha posterior de auditoria pode deixar sessão real consumindo capacidade: sem revogação automática; recuperação por gestão própria existente/expiração. Serialização global pode ser gargalo; não há benchmark/failover/produção certificados. Prova, operação e testes: [estudo #17](docs/authorization/ATOMIC_SESSION_ADMISSION_STUDY.md) e [revisão relógio/contenção/rollout](docs/authorization/ATOMIC_SESSION_ADMISSION_REVIEW.md). Leituras não escrevem no coordenador; contenção de escrita ainda pode bloquear admissões de A e B. Refresh revalida após CAS e pode consumir segredo sem devolver credencial se a checagem falhar.

Estas entregas de segurança não concluem os CRUDs comerciais nem a preparação de produção. As próximas fundações incluem reforços de contas/sessões, CI/CD, ambientes/recuperação e vínculos empresariais, sem implementação antecipada.

### Gestão de sessões — #5 / PR #10

`GET /auth/sessions` lista as próprias sessões ativas com paginação, identificação da atual e sem credenciais. `DELETE /auth/sessions/:id`, `/auth/sessions/others` e `/auth/sessions` revogam uma, as demais ou todas as próprias. A identidade e a política são revalidadas no serviço.

`/auth/organization-sessions` permite ao SYSTEM_ADMIN do vínculo ativo listar/revogar apenas sessões daquela organização. Não concede controle sobre sessões pessoais ou de outra empresa de conta compartilhada.

Revogações, logout, replay e limite de rotações geram registros duráveis em `auth_session_revocations`, sem tokens/hashes e sem TTL. A própria inserção é a regra autoritativa de bloqueio, sem janela de duas escritas. A implementação histórica da #5 não exigia replica set; nesta branch, a #17 inclui sua inserção na transação de coordenação e passa a exigi-lo. Não decidir atividade olhando apenas `auth_sessions.revokedAt`. Novos logins após o corte de uma revogação em lote continuam possíveis.

Validação local: 204 unitários, 53 HTTP/sessões/isolamento e 13 vínculos/provisionamento com MongoDB real, além de E2E/build/lint/tipos. Limites, endpoints, retenção e instruções: [estudo e execução](docs/authorization/SESSION_MANAGEMENT_IMPLEMENTATION_STUDY.md).

### Auditoria geral — #6

Login/falhas, refresh e decisões de autenticação/autorização são persistidos em `security_audit_events`, sem credenciais, payloads ou mensagens de erro brutas. A fonte autoritativa `auth_session_revocations` continua separada e preservada. Correlação é gerada pelo servidor e retornada em `X-Request-Id`; falha de auditoria bloqueia a operação, não libera acesso.

`GET /audit/own-events` consulta eventos da própria identidade; `GET /audit/organization-events` exige AUDITOR ou SYSTEM_ADMIN de vínculo ativo na organização atual. As rotas usam o prefixo global `/api` e o envelope `payload/message` existente. Paginação até 100, filtros server-side, projeção/mapper positivos e união das duas fontes sem copiar as regras.

Sem TTL/purga nas fontes de auditoria. Antes da primeira inicialização em cada ambiente, operador deve executar `npm run audit:initialize` com `AUDIT_MONGO_URL` explícita antes da API; runtime verifica índices e deve usar privilégios mínimos por coleção, sem poder alterar/apagar auditoria. `npm run audit:export` produz arquivo JSONL/manifest sem remover eventos. Instruções, configuração, riscos de falha/retenção e estudo: [Auditoria geral](docs/authorization/SECURITY_AUDIT_IMPLEMENTATION_STUDY.md).

### Papéis atuais

| Papel | Responsabilidade inicial |
|---|---|
| `SYSTEM_ADMIN` | Administração técnica, usuários e papéis. |
| `ORGANIZATION_OWNER` | Responsável pela organização. |
| `MANAGER` | Gestão operacional. |
| `INVENTORY_OPERATOR` | Operação de estoque e depósito. |
| `SALES_ASSOCIATE` | Vendas e atendimento. |
| `CASHIER` | Caixa e recebimentos. |
| `PURCHASING_AGENT` | Compras e fornecedores. |
| `FINANCIAL_ANALYST` | Financeiro e conciliação. |
| `AUDITOR` | Consulta de auditoria e relatórios autorizados. |
| `CUSTOMER` | Cliente: acesso futuro aos próprios dados e pedidos. |

Papéis não são a única decisão: as políticas atuais consideram organização, vínculo, proprietário, estado e sessão. Atributos específicos dos futuros CRUDs comerciais, como local de estoque, serão definidos com cada recurso.

A matriz inicial está em [`docs/authorization/ROLE_AND_PERMISSION_MATRIX.md`](docs/authorization/ROLE_AND_PERMISSION_MATRIX.md).

## Requisitos

- Node.js 24.x (veja `.nvmrc`);
- npm 11 ou superior;
- MongoDB 8 em replica set para a #17 (ou Docker com replica set explicitamente configurado);
- Docker Engine e Docker Compose, opcionalmente.

## Configuração local

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure o ambiente

Copie o exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Gere o segredo JWT:

```bash
npm run cli -- generate:jwt-secret
```

Defina pelo menos:

```env
HOST=0.0.0.0
PORT=3000
MONGO_URL=mongodb://localhost:27017/animal-feed-warehouse
JWT_SECRET=<segredo-forte-gerado>
JWT_EXPIRES_IN=15m
CORS_ORIGIN=http://localhost:5173
CORS_CREDENTIALS=true
```

Nunca envie o arquivo `.env`, senhas SMTP ou segredos JWT ao Git.

### 3. Inicie o MongoDB

Com Docker:

```bash
docker compose up -d mongo-db
```

Ou execute uma instância local do MongoDB.

Antes do primeiro start, prepare as coleções de auditoria com `npm run audit:initialize`, informando `AUDIT_MONGO_URL` explicitamente para o banco local escolhido. O comando não usa `.env`/`MONGO_URL` por fallback e não apaga eventos. Para a instalação real, planeje primeiro o provisionamento inicial com API parada; não use o seeder escolar. Veja o [procedimento de auditoria](docs/authorization/SECURITY_AUDIT_IMPLEMENTATION_STUDY.md).

### 4. Inicie a API

```bash
npm run start:dev
```

A API ficará disponível em `http://localhost:3000/api`.

## Documentação da API

Com a aplicação em execução:

- Swagger UI: `http://localhost:3000/api/docs`
- Documento OpenAPI: `http://localhost:3000/api/docs-json`

## Comandos úteis

```bash
# Compilar
npm run build

# Executar testes
npm test -- --runInBand

# Executar lint
npm run lint

# Formatar arquivos TypeScript
npm run format

# Iniciar em desenvolvimento
npm run start:dev

# Gerar segredo JWT
npm run cli -- generate:jwt-secret

# Popular dados de demonstração legados
npm run cli -- seed
```

> O seed atual pertence à base anterior e será substituído por dados de produtos, estoque e organização quando os módulos comerciais forem criados.

## Roadmap

O Kanban e as issues da modernização estão no repositório. A ordem de implementação é:

1. papéis empresariais e matriz de permissões — concluído;
2. sessões independentes por dispositivo e rotação segura de refresh token — implementado e validado;
3. motor de políticas PBAC — implementado e validado;
4. ABAC e isolamento por organização/recurso — implementado e validado nos recursos atuais, com provisionamento inicial controlado;
5. gestão de sessões — integrada e validada (#5 / PR #10);
6. auditoria geral e regressões de segurança — integrada e validada (#6 / PR #11);
7. [reforço de sessões/contas (#12)](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/12) — principal aberta, tickets #16–#23; #16 configura limites, sem antecipar admissão/substituição #17/#18;
8. [CI/CD e qualidade (#13)](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/13) — Backlog;
9. [ambientes, observabilidade e recuperação (#14)](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/14) — Backlog;
10. [funcionários e vínculos (#15)](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/15) — Backlog;
11. produtos, categorias, marcas e unidades;
12. locais, saldo e movimentações de estoque;
13. fornecedores, compras e recebimento;
14. clientes, vendas e caixa;
15. financeiro, relatórios e alertas;
16. NFe/NFC-e e demais integrações fiscais.

As quatro novas issues foram apenas planejadas, não implementadas. Dependências e aceite estão nos corpos das issues e em `docs/issues/`.

## Qualidade e segurança

Antes de abrir um pull request, execute:

```bash
npm test -- --runInBand
npm run build
npm run lint
```

Diretrizes obrigatórias:

- validar autorização no servidor em toda rota protegida;
- negar acesso por padrão;
- não expor senhas, JWTs ou refresh tokens em logs;
- não permitir que cadastro público defina papéis administrativos;
- criar testes de sucesso e negação para cada política nova;
- não excluir registros comerciais críticos sem estratégia de auditoria/soft delete.

## Estrutura principal

```text
src/
  common/                 # Guards, decorators, pipes e infraestrutura compartilhada
  config/                 # Validação de variáveis de ambiente
  features/
    auth/                 # Login, JWT e refresh token
    users/                # Usuários e papéis
    mail/                 # Infraestrutura de e-mail
  infrastructure/database # MongoDB/Mongoose

docs/
  authorization/          # Matriz de permissões e material de estudo
  issues/                 # Planejamento versionado
  kanban/                 # Kanban da modernização
```

## Licença

Consulte o arquivo [`LICENSE`](LICENSE), preservado do histórico original do repositório.
