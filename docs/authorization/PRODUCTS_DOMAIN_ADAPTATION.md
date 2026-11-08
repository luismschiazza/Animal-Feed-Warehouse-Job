# Produtos — adaptação do domínio escolar (desenho antes do código)

Base: main a9667fd8c1198640012d445f5261731229fda31b. Autorização: implementar apenas produtos em branch isolada, preservar usuários/autenticação/sessões/PBAC/ABAC/auditoria e preparar PR; sem merge/deploy/outros CRUDs. Estrutura da raiz preservada; novos arquivos nas pastas existentes src/features, src/commands, test e docs.

## Referência e alternativas

Comparados disciplines (cadastro simples/name), attendance (presença/aluno/disciplina), grades (notas/período/tipo) e meeting (agenda/participantes/conflitos). **Disciplines é a referência estrutural adequada**, não um modelo de negócio para copiar: controller/service/DTO/schema/models/module. Renomear disciplina mantendo apenas name não atende catálogo, copiar notas/preços ou presença/saldo produz regras erradas. Também não remover disciplines agora: grades/attendance ainda referenciam sua coleção e não existe autorização para migrar dados/regras dos demais módulos.

Produto usa recurso PRODUCT próprio na política central, modelo/coleção products próprios e service dedicado. Reutiliza resolução autoritativa de sessão/conta/vínculo/organização/atributos; não reutiliza regras de alunos/notas/eventos/email nem altera usuários. Leituras e filtros finais sempre incluem organização do ator revalidado. Comparação: ampliar CRUD genérico com regras condicionais de catálogo espalharia regras novas na infraestrutura escolar; **service dedicado com autorização compartilhada** isola o domínio. Adiciona apenas registro do modelo para resolução de atributos/guard.

## Contrato inicial

- POST/GET /api/products, GET/PATCH/DELETE /api/products/:id.
- sku ASCII 1..64 (letras/números, ponto, hífen, underscore; começa alfanumérico), trim e uppercase canônicos. Obrigatório/imutável; único em (organizationId, sku), inclusive arquivados. Mesmo SKU em organizações diferentes permitido. Não usar consulta prévia como garantia de unicidade.
- name obrigatório 1..160; description opcional até1000 e brand até80; Unicode/texto puro, trim, sem HTML renderizado pelo backend.
- category obrigatório: feed/treat/supplement/accessory/hygiene/other. targetSpecies: dog/cat/bird/fish/small_pet/equine/livestock/other. Uma espécie principal nesta versão, não regra veterinária/recomendação nutricional.
- saleUnit obrigatório unit/kg, **imutável** para não reinterpretar silenciosamente preço/saldos futuros. priceCents obrigatório inteiro 1..100000000, **BRL por unidade ou kg**; sem float monetário. packageWeightGrams opcional inteiro1..1000000 (metadado de embalagem, não saldo).
- status active/discontinued; active padrão. Estado comercial não substitui accessState de autorização.
- PATCH parcial não vazio, sem null em campos; SKU/saleUnit/metadados de segurança/operadores/campos escolares desconhecidos rejeitados também na service. Texto opcional pode ser esvaziado; remoção de peso opcional não exposta nesta versão.
- DELETE arquiva (archivedAt), mantém documento/SKU/auditoria para referências futuras. Arquivado some da lista/leitura normal e não pode editar/desarquivar; sem restauração nesta versão. Não apagar/apropriar registros legados sem tenant metadata.
- Lista por cursor _id descendente, limite padrão25/máximo100, só antes/limit; sem filtros Mongo/tenant/owner arbitrários. Não prometer listagem de catálogo público para CUSTOMER.
- Sem estoque editável, lote, validade, fornecedor, venda, custo/margem/impostos/desconto ou migração de dados: exigem modelos/regras próprios. Catálogo de produtos ≠ inventário.

## Segurança, permissões e atomicidade

Políticas explícitas, sem herança/bypass: SYSTEM_ADMIN, ORGANIZATION_OWNER e MANAGER podem criar/editar/arquivar; esses e INVENTORY_OPERATOR/SALES_ASSOCIATE/CASHIER/PURCHASING_AGENT/FINANCIAL_ANALYST/AUDITOR podem ler/listar, só no vínculo/organização ativos. CUSTOMER não acessa CRUD interno. Escritas exigem accessState active; locked é legível mas não mutável. Permissões dos recursos existentes intocadas.

SKU único via índice composto real, sem partial/sparse. Product schema autoCreate/autoIndex false; initializer operador com PRODUCTS_MONGO_URL explícita, sem dotenv/fallback/seed/reset. Runtime verifica índice completo antes de escrever, sem reparo/DDL; coleção/índice ausentes/inadequados bloqueiam com503. Inicializador falha em duplicatas, não deduplica dados. Revisão operacional de permissões/índice necessária antes de habilitar.

**Produto + evento PRODUCT de resultado na mesma transação snapshot/majority**, sem fallback standalone; pré-autorização compartilhada preserva logs AUTHORIZATION e revalida fatores atuais (não cache de claims). Credencial/sessão e mudança de vínculo não se tornam retroativamente canceláveis: não alegar linearização global entre catálogo e todos os escritores de identidade. Filtro final repete tenant/id/owner/creator/accessState/archivedAt, sem trusted metadata do cliente. Operações de transação sequenciais e sessão explícita; conflitos/retries não devem duplicar inserções/auditoria de conclusão. Escritas de mesmo campo são last-write-wins; não há ETag/controle otimista de edição humana nesta versão.

Sem corpo de produto/senha/JWT/segredo no audit, apenas resource/action/target/ator/organização/request. Duplicata409 genérica, validação400 sem erro interno Mongo, IDs/scope negados sem vazamento de documento. Resposta de escrita só após commit; perda HTTP ou commit incerto NÃO prova rollback nem exactly-once. SKU permite ao operador consultar estado após resposta perdida de create; não há protocolo de idempotência de produtos nesta entrega.

## Mapeamento dos demais módulos — proposta apresentada, NÃO implementar

| Origem | Proposta loja | Decisão antes da próxima implementação |
|---|---|---|
| users | Manter identidade e vínculos; não converter contas em alunos/clientes automaticamente | Clientes/fornecedores são cadastros comerciais separados, acesso por vínculo continua |
| attendance | Referência estrutural para movimentos de estoque | ledger entrada/saída/ajuste, quantidade/unidade/lote/validade/motivo/autorização; não editar presença como saldo |
| grades | Descontinuar domínio escolar; não converter nota em preço | preços/custos e itens comerciais com modelos próprios, integridade de venda/estoque/finanças antes de implementar |
| meeting | Referência estrutural para agenda de entrega/recebimento | parceiros, janela/estado logístico, política real de conflito; sem participantes escolares/email automático |
| disciplines | Referência estrutural para products, sem migração automática | só remover legado após planos dos dependentes e dados, autorização específica |

## Orientação oficial consultada ANTES do código — 2026-11-04

Corpos/status/datas/hashes preservados em D:/programacao/documentos/products-domain-crud-pr/fontes-oficiais. Página Nest SPA não trouxe texto; primeira URL raw antiga retornou404, preservada; conteúdo oficial atual obtido do repositório Nest. Não confundir HTTP200 de shell com conteúdo consultado.

- https://docs.nestjs.com/techniques/validation e https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/application/validation.md — whitelist + forbidNonWhitelisted + tipos explícitos; não confiar em transformação implícita de valores monetários.
- https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html — validação sintática/semântica/allowlist de campos/ranges/tipos também na service; Unicode livre limitado para nomes, não bloquear apóstrofo como falsa segurança.
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html — tenant do contexto autenticado, filtros em todo acesso, atributos revalidados, testes IDOR. Não alegar isolamento físico/RLS por usar filtros Mongo.
- https://www.mongodb.com/docs/manual/core/index-unique/ — índice composto protege concorrência; unique não é validador de DTO, duplicatas impedem criação do índice.
- https://www.mongodb.com/docs/drivers/node/current/crud/transactions/ — sessão em toda operação transacional, sem paralelismo no callback, erro de operação aborta; não garante entrega HTTP.

## Plano de validação e riscos

Antes da PR: unitários schema/DTO/policy, HTTP real MongoRS com login/sessões/guard originais; CRUD/normalização/BRL/SKU por tenant/arquivamento; permissões todos os papéis/conta-vínculo-org revogados; A/B/pessoal/cross-ID/authority tamper/service direta; índice ausente/duplicata concorrente; falhas de auditoria/validador transacionais sem escrita parcial; paginação/unknown/null/injeção; regressão integral de usuários/sessões/ABAC/auditoria/AppModule/CLI/assets/CI, sem baixar asserts/budgets/gates. Sem banco/conta/email reais.

S1/#28/overrides/dependências preservados: auditoria completa pode continuar6LOWdev/exit1, não declarar limpa/renovar. Cliente catálogo/UI e integração inventário/logística/financeiro permanecem pendentes; não é certificação de produção, fiscal/MAPA, nutrição ou performance. A cópia externa pré-código foi preservada; os resultados posteriores seguem abaixo.

## Continuação e revisão — 2026-11-06

Branch existente `feat/products-store-domain`, base `a9667fd`. Patch e arquivos novos da sessão interrompida preservados em evidência externa antes de editar. Nenhum arquivo do módulo users foi alterado; generic CRUD escolar continua negado para PRODUCT. A revisão manteve arquitetura dedicada e a autorização compartilhada, corrigindo a classificação do conflito de SKU na auditoria: 409 agora registra resultado `denied`, não erro interno de infraestrutura.

Fontes oficiais reconsultadas antes das alterações: URLs MongoDB transactions/unique e OWASP multi-tenant acima, HTTP200, cópias/extratos/metadados em `D:/programacao/documentos/products-domain-crud-review-20261104`. Sessão explícita em cada escrita transacional e operações sequenciais; sem consulta prévia como garantia de SKU. Não há promessa de RLS, exclusão mútua contra DDL do operador ou linearização global de identidade.

### Evidência local nova (não confundir com CI remoto)

- **330 unitários / 27 suítes**, **4 E2E / 2 suítes**, lint/TypeScript/build/Babel coverage/assets aprovados.
- **248 HTTP/MongoDB / 4 suítes**, sendo **67 produtos + 181 sessões/admissão/substituição**, em replica set descartável, duas aplicações/pools, transactionLifetimeLimitSeconds=5 e TTL desligado. **13 ABAC/provisionamento / 2 suítes** e AppModule real aprovados.
- Produtos: todos os papéis via vínculo atual; A/B com SKU igual; IDOR/body/query/header/roles falsificados; contexto pessoal/sessões revogadas; locked/legado/arquivo; validação monetária/cursor/allowlist e caller direto; corrida create/create com um201/um409 e um evento de conclusão; update/update e update/archive entre pools; retry real TransientTransactionError sem evento duplicado; índices ausente/nonunique/partial/sparse bloqueiam sem reparo.
- Rollback demonstrado nos dois sentidos para create/update/archive: validator Mongo rejeita produto ou auditoria e não há mutação parcial/evento de conclusão órfão. Eventos AUTHORIZATION são tentativas independentes e podem permanecer após rollback; somente evento PRODUCT allowed comprova conclusão transacional.
- CLI **fonte e compilada do checkout atual**: cria armazenamento vazio, exige PRODUCTS_MONGO_URL, falha com duplicatas e não repara dados; índice restaurado somente pelo teste-operador no banco descartável.
- Novo smoke autenticado `npm run test:products-operations`: HTTP CRUD com runtime limitado a find/insert/update/listIndexes em products; delete/DDL de produto e update/delete de auditoria negados pelo MongoDB. Incluído no job autenticado do CI sem reduzir regras/checks anteriores. Smokes originais de ACL/exportador/retirada de principal, inicializador de admissão e substituição/recuperação fonte+compilada também aprovados.
- Tentativa inicial do novo smoke ACL falhou na compilação por uso de helpers dropUser/dropRole inexistentes no tipo Db. Corrigida para comandos explícitos MongoDB de limpeza **somente do banco aleatório próprio**; falha e reexecução preservadas, nenhuma assertion reduzida.

### Operação e limites

Ver comandos/ACL no README. Sem catálogo público CUSTOMER, UI, estoque/lotes/validade, impostos, integração comercial, restore, ETag ou idempotency key. Edição concorrente do mesmo campo é last-write-wins; arquivamento nunca é revertido por PATCH. Revalidação de identidade usa os serviços atuais fora da sessão de catálogo: não cancela retroativamente uma operação concorrente com revogação. Perda de resposta/commit incerto pode esconder um efeito confirmado; consultar estado antes de repetir uma intenção, sem promessa exactly-once. Falhas de auditoria bloqueiam escrita; registros de erro também podem falhar se o journal estiver indisponível.

Dependências/lock/engines/overrides e escopo/prazo S1 inalterados. Auditorias locais reais: produção0/exit0, completa6LOWdev/exit1. S1 não é auditoria limpa e expira em2026-11-10T22:09:20.702Z, acompanhamento #28. O CI remoto inicial `42311614908`, head `5e1dd59`, passou nos dois jobs e em todos os passos, incluindo mTLS nativo Ubuntu (plaintext/CA não confiável recusados), novas ACLs de produto e os mesmos totais de testes. O merge virtual testado foi `7aac6f9`, base `a9667fd`. Esta atualização posterior é somente documentação; conferir também o CI do HEAD final da PR. Testes locais/remotos não certificam produção, HA, backup, rollout ou desempenho.

**Estado: proposta para revisão, sem merge/deploy.** CI remoto e identidade final serão conferidos na PR. Evidências detalhadas/logs/exits fora do Git em `D:/programacao/documentos/products-domain-crud-review-20261104`; evidências da primeira sessão em `D:/programacao/documentos/products-domain-crud-pr`, preservadas.
