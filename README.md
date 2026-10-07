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

A API usa JWT com access token e refresh token. A autorização está sendo evoluída de RBAC para ABAC/PBAC.

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

Papéis não devem ser a única decisão de acesso. Nas próximas etapas, as políticas avaliarão atributos do usuário, do recurso e do contexto — por exemplo: organização, proprietário do registro, local de estoque, vínculo e estado da conta.

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
JWT_EXPIRES_IN=24h
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
2. sessões independentes por dispositivo e rotação segura de refresh token;
3. motor de políticas PBAC;
4. ABAC e isolamento por organização/recurso;
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

Projeto privado. Todos os direitos reservados.
