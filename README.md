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

Estas entregas de segurança não concluem os CRUDs comerciais nem a preparação de produção: seguem a auditoria geral #6 e o planejamento dos reforços.

### Gestão de sessões — #5 / PR #10

`GET /auth/sessions` lista as próprias sessões ativas com paginação, identificação da atual e sem credenciais. `DELETE /auth/sessions/:id`, `/auth/sessions/others` e `/auth/sessions` revogam uma, as demais ou todas as próprias. A identidade e a política são revalidadas no serviço.

`/auth/organization-sessions` permite ao SYSTEM_ADMIN do vínculo ativo listar/revogar apenas sessões daquela organização. Não concede controle sobre sessões pessoais ou de outra empresa de conta compartilhada.

Revogações, logout, replay e limite de rotações geram registros duráveis em `auth_session_revocations`, sem tokens/hashes e sem TTL. A própria inserção é a regra autoritativa de bloqueio, sem janela de duas escritas ou exigência de replica set. Não decidir atividade olhando apenas `auth_sessions.revokedAt`. Novos logins após o corte de uma revogação em lote continuam possíveis.

Validação local: 204 unitários, 53 HTTP/sessões/isolamento e 13 vínculos/provisionamento com MongoDB real, além de E2E/build/lint/tipos. Limites, endpoints, retenção e instruções: [estudo e execução](docs/authorization/SESSION_MANAGEMENT_IMPLEMENTATION_STUDY.md).

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
- MongoDB 8 ou Docker;
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
5. auditoria e testes de segurança;
6. produtos, categorias, marcas e unidades;
7. locais, saldo e movimentações de estoque;
8. fornecedores, compras e recebimento;
9. clientes, vendas e caixa;
10. financeiro, relatórios e alertas;
11. NFe/NFC-e e demais integrações fiscais.

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
