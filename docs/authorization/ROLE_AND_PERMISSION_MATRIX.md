# Matriz inicial de papéis e permissões

> Issue: [#1](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/1)  
> Estado: base RBAC definida; ABAC/PBAC será aplicada nas issues #3 e #4.

## Princípios

- **Negar por padrão:** ausência de política explícita significa negação.
- **Menor privilégio:** um papel não concede acesso ilimitado aos registros.
- **Papéis são atributos:** serão entrada das políticas; não substituem a checagem de organização, proprietário, vínculo ou estado do recurso.
- **Separação de funções:** compra, estoque, venda e financeiro são funções distintas.
- **Administração de usuários:** somente `SYSTEM_ADMIN` poderá atribuir ou modificar papéis na fase inicial.

## Papéis

| Papel | Responsabilidade inicial | Não concede automaticamente |
|---|---|---|
| `SYSTEM_ADMIN` | Administração técnica e de usuários | Acesso entre organizações, salvo política explícita |
| `ORGANIZATION_OWNER` | Proprietário/responsável pela organização | Administração da plataforma |
| `MANAGER` | Gestão operacional e relatórios da organização | Administração técnica e financeira irrestrita |
| `INVENTORY_OPERATOR` | Recebimento, inventário, transferências e ajustes autorizados | Venda, pagamento e alteração de políticas |
| `SALES_ASSOCIATE` | Orçamento, pedido e venda | Ajuste de estoque, fechamento de caixa e custo |
| `CASHIER` | Abertura, recebimento, sangria e fechamento de caixa | Alteração de preço, estoque e compras |
| `PURCHASING_AGENT` | Fornecedores, cotações e compras | Pagamento, estoque físico e venda |
| `FINANCIAL_ANALYST` | Contas a pagar/receber e conciliação | Alterar estoque ou conceder acesso |
| `AUDITOR` | Consulta de auditoria e relatórios autorizados | Criar, alterar ou excluir dados operacionais |
| `CUSTOMER` | Acesso futuro aos próprios dados, pedidos e perfil | Dados internos, outros clientes ou operações da empresa |

## Matriz de recursos alvo

| Recurso/Ação | Papéis candidatos | Condições futuras ABAC/PBAC |
|---|---|---|
| Usuários e papéis | `SYSTEM_ADMIN` | Organização e escopo administrativo compatíveis |
| Produtos e catálogo | `MANAGER`, `INVENTORY_OPERATOR`, `SALES_ASSOCIATE`, `PURCHASING_AGENT` | Leitura limitada à organização; alteração por ação específica |
| Estoque e movimentos | `INVENTORY_OPERATOR`, `MANAGER`, `AUDITOR` (somente leitura) | Organização, local de estoque e motivo do ajuste |
| Compras e fornecedores | `PURCHASING_AGENT`, `MANAGER`, `AUDITOR` (somente leitura) | Organização e estado do pedido |
| Vendas e clientes | `SALES_ASSOCIATE`, `CASHIER`, `MANAGER` | Organização e relação com venda/caixa |
| Caixa e pagamentos | `CASHIER`, `FINANCIAL_ANALYST`, `MANAGER` | Caixa atribuída, turno e estado de fechamento |
| Financeiro | `FINANCIAL_ANALYST`, `MANAGER`, `AUDITOR` (somente leitura) | Organização e período contábil |
| Auditoria | `AUDITOR`, `MANAGER`, `SYSTEM_ADMIN` | Organização e escopo permitido |
| Conta do cliente | `CUSTOMER` | Somente proprietário autenticado |

## Compatibilidade temporária

Os módulos atuais ainda pertencem ao domínio escolar. Até sua substituição, suas rotas administrativas foram mapeadas para `SYSTEM_ADMIN` e `MANAGER` exclusivamente para manter a API compilável. Eles não definem a matriz definitiva do sistema de estoque.
