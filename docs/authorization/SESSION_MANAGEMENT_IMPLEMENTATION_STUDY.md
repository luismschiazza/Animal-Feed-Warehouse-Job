# Issue #5 — Gestão de sessões: estudo e execução

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/5
PR: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/10
Branch de implementação: `feat/issue-5-session-management`.

## Estado real

**Concluída e integrada à main pela PR #10**, merge `76f18523fadbf4944f4d97dfb1d022b17585cfea`. Implementação final `893aa37`; etapa inicial `0624e1b`. Validação completa repetida na main: 204 unitários, 53 HTTP, 13 vínculos/provisionamento, 1 E2E, build/lint/tipos/diff --check aprovados. Issue/Project atualizados após integração validada. Não confundir esta entrega com a auditoria geral da #6 ou com preparação completa de produção.

Pasta local: `C:\Users\Usuário\Desktop\system-SASS-racoes`. Instalação futura da loja será nova/banco vazio. Nenhum banco da aplicação foi alterado, nenhuma conta real provisionada, nenhum email real enviado.

## Evolução e arquivos

### Etapa 1 — listagem (commit 0624e1b)

- `SessionsController`: GET próprio autenticado por JWT, sessão e política SESSION:LIST.
- `SessionManagementService`: revalida conta/sessão/vínculo no serviço, não apenas no controller.
- `ListSessionsDto`: limit inteiro de 1 a 100, padrão 25; before é cursor validado. Cliente não escolhe userId/organizationId.
- Projeção positiva e mapper explícito: nunca devolver documento inteiro de sessão.
- 174 unitários, 42 HTTP e 13 vínculos/provisionamento aprovados na etapa 1.

### Etapa 2 — revogação, administração e auditoria

- `session-revocation.schema.ts`: coleção permanente de regras/eventos, sem TTL.
- `session-revocations.service.ts`: gravação durável única, consulta de bloqueios, deduplicação e lookup equivalente para listagens.
- `auth-sessions.service.ts`: autenticação e refresh verificam regras; listagens filtram revogações lógicas antes de paginar; logout/replay/cap auditados.
- `session-management.service.ts`: carrega alvo real com filtro de proprietário ou organização e reavalia política com atributos do banco.
- `sessions.controller.ts`: operações próprias e controller administrativo separado.
- `policies.guard.ts`: usa loader real de sessões, em vez de atribuir o proprietário atual a qualquer ID solicitado.
- `policy.types.ts`/`policy.registry.ts`: ações explícitas REVOKE_OTHERS/REVOKE_ALL e recurso ORGANIZATION_SESSION; sem bypass global.
- Módulos registram/exportam serviços e modelos; cobertura de metadata inclui os novos handlers.
- Identidade do proprietário, organização e SID da família são imutáveis nas escritas normais Mongoose. Índices apoiam listagens por usuário/organização e consultas de revogação.

## Endpoints e política

| Método/rota | Permissão e efeito |
|---|---|
| GET /auth/sessions | Somente sessões próprias ativas, entre contextos |
| DELETE /auth/sessions/:id | Somente sessão própria específica, inclusive a atual |
| DELETE /auth/sessions/others | Próprias até o instante capturado, exceto o SID atual |
| DELETE /auth/sessions | Próprias até o instante capturado, incluindo a atual |
| GET /auth/organization-sessions | SYSTEM_ADMIN do vínculo ativo; apenas organização atual |
| DELETE /auth/organization-sessions/:id | SYSTEM_ADMIN; alvo real da organização atual |
| DELETE /auth/organization-sessions | SYSTEM_ADMIN; sessões daquela organização até o instante capturado, incluindo a atual |
| POST /auth/logout | Sessão atual; comportamento anterior preservado, agora auditado |

Todas as rotas acima exigem autenticação/política. Não há endpoint de revogação global entre empresas. MANAGER/ORGANIZATION_OWNER sozinhos não herdam os poderes de SYSTEM_ADMIN. O cadastro inicial pode ter esses papéis combinados no vínculo, não como bypass.

Administração em A NÃO permite revogar sessões pessoais ou de B de uma conta compartilhada. O proprietário da própria identidade pode gerenciar suas sessões entre contextos, sem ganhar dados empresariais de outra organização. Conta suspensa não autentica; conta ativa pode usar contexto pessoal para gerenciar sessões cujo vínculo empresarial esteja inválido.

Alvo estrangeiro, inexistente, expirado ou já revogado retorna 404 genérico para caller autorizado. Papel administrativo ausente é negado antes de resolver existência do alvo. Repetições concorrentes de um alvo específico podem retornar 200 ou 404 dependendo do instante da leitura; somente um evento específico fica persistido. Não se reescreve a atribuição do primeiro evento.

## Por que a auditoria também é a regra de revogação?

Gravar `session.revokedAt` e só depois gravar um evento em outra coleção permite falhar entre as duas escritas: sessão revogada sem auditoria. Gravar o evento primeiro e tratá-lo como simples log também pode registrar uma revogação que nunca aconteceu.

Nesta entrega, a coleção `auth_session_revocations` é a fonte autoritativa: inserir a regra **é** revogar. O mesmo documento registra ator, contexto, alvo/escopo, ação e horário. Uma inserção MongoDB atômica com write concern majority/journal elimina a janela de duas escritas, sem transações multi-documento e sem exigir replica set. Testado em MongoDB 8 standalone.

- Regras `session`: SID e proprietário exatos. Índice único parcial impede duplicação concorrente do evento específico.
- Regras `user`: identidade exata e corte de createdAt; pode excluir somente o SID autenticado na operação “others”.
- Regras `organization`: organização exata e corte de createdAt, sem afetar contexto pessoal.
- Schema valida combinação de ação/escopo, ator, alvo e exclusão. Não há payload público para criar regras arbitrárias.
- Sem token, senha, verificador ou histórico de refresh nos eventos. Falha de replay/limite é iniciador system, não alegação de humano autenticado.
- Leituras autoritativas e listagens usam primary para não depender de atraso de réplica na visibilidade da revogação.
- Se a escrita falha antes de persistir, não há revogação sem evento nem resposta de sucesso. Timeout/perda de conexão pode deixar a confirmação incerta: a regra pode ter sido gravada com seu efeito/auditoria juntos; consultar o estado e não prometer rollback. Falha de leitura não concede autenticação: operação falha fechada.

`auth_sessions.revokedAt/revocationReason` continua sendo um marcador físico/compatibilidade para bloqueios automáticos anteriores. Gestão/logout não dependem de atualizar esse cache. **Não consultar apenas revokedAt para decidir que uma sessão está ativa:** também verificar as regras. No replay/cap, grava-se a regra antes do cache; se a atualização do cache falhar, a regra continua bloqueando a família com auditoria durável.

A coleção de eventos NÃO tem TTL e não possui endpoint de alteração/exclusão. Remover a sessão por TTL não remove a auditoria. Retenção/arquivamento e permissões operacionais append-only devem ser formalizados na #6; não apagar regras das quais sessões ainda possam depender, pois isso pode reativá-las. Imutabilidade no código não impede operador privilegiado de manipular diretamente o banco.

## Concorrência, corte e refresh

Bulk insere uma regra de tamanho fixo; não enumera milhares de SIDs nem adiciona limite de sessões. O retorno contém revocationId, scope, occurredAt, revokedBefore e excludesCurrent; NÃO promete contagem exata de documentos afetados por um snapshot transacional.

O corte usa o createdAt de servidor das sessões e o instante capturado na operação. Sessões criadas depois desse corte podem continuar válidas, inclusive logins concorrentes posteriores ao corte. Isso não suspende conta/organização nem impede novos logins com credenciais válidas. Relógios dos servidores precisam estar sincronizados; não aceitar datas escolhidas pelo cliente.

Refresh mantém seu CAS atômico no documento e revalida regras antes/depois; AuthService também revalida antes de emitir o par. Uma corrida pode consumir o refresh sem entregar novo par. Após a revogação reconhecida, qualquer par emitido antes/durante a corrida é recusado nos próximos acessos/refreshes.

Exatamente um CAS pode vencer na concorrência com o mesmo refresh, mas replay pode revogar a família antes que esse vencedor entregue credenciais: zero ou um retorno bem-sucedido, nunca dois vencedores de rotação. Segredo incorreto não prova replay e não revoga a família.

Autorização é snapshot: não promete cancelar retroativamente uma requisição já autorizada. Revogar a sessão atual não impede a própria resposta de revogação, mas impede próximos usos. O cliente deve coordenar refresh em single-flight e limpar suas credenciais ao receber revogação.

## Listagem segura e dispositivo atual

Resposta paginada `{ items, nextCursor }`, com limit 1..100 (25 padrão) e before opcional. Ordenação decrescente por _id, sem snapshot estável entre páginas concorrentes.

- Campos: sessionId público, organizationId/null, current, userAgent/ip quando existentes, createdAt, lastRefreshedAt, expiresAt. No endpoint administrativo, também userId do proprietário pertencente à organização autorizada.
- Projeção e mapper explícitos; nunca access/refresh token, currentTokenId, hashes, consumedTokens, senha ou documento bruto.
- current é igualdade do SID com a sessão autenticada; não User-Agent/IP. Metadados não comprovam dispositivo físico e devem ser apresentados como texto, não HTML confiável.
- lastRefreshedAt é atualizado no login/refresh, NÃO a cada request; não indica presença online.
- nextCursor é posição pública, não credencial; não contorna o filtro de proprietário/organização.
- MongoDB faz lookup das regras antes do limite da página: sessões logicamente revogadas não ocupam páginas nem reaparecem por verificar apenas o cache físico.

## Validação local final

- **204 unitários / 18 suítes**.
- **53 HTTP/sessões/PBAC/ABAC com MongoDB 8 real**.
- **13 vínculos/provisionamento com MongoDB real**.
- 1 E2E existente, build/lint, checagem TypeScript incluindo testes e diff --check aprovados.
- Evidência local; não há CI remoto configurado. Validação repetida na main antes de concluir integração/issue.

Cobertura real: proprietário versus outro usuário, alvos estrangeiros, atual/outras/todas, conta compartilhada A/B, headers forjados, papéis recarregados, preservação de contexto pessoal/B, administrador revogando contexto de conta suspensa, novos logins após corte, expiração/TTL, persistência de auditoria após remoção física, concorrência/deduplicação, falha de gravação/leitura e refresh concorrente com revogação. Retidas regressões de replay, limite de rotações, CAS e referências/notificações isoladas.

Reprodução somente em servidor MongoDB descartável:
```text
SESSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:<porta> npm run test:sessions
ABAC_TEST_MONGO_URL=mongodb://127.0.0.1:<porta> npm run test:abac
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run lint
npx tsc --noEmit --incremental false -p tsconfig.json
```

As suítes criam/removem apenas bancos únicos sessions_test_*/abac_test_*. Nunca usar MONGO_URL da aplicação. Container dedicado removido ao final.

## Limites e próximos passos

- Não há histórico anterior inventado/backfill: revogações anteriores à entrega não se tornam auditadas retroativamente.
- A nova coleção precisa estar disponível e com índices/permissões corretos antes de servir autenticação; a aplicação aguarda inicialização do modelo. Não executar alterações manuais no banco real sem acordo.
- Auditoria geral de login, falhas e decisões de autorização, política formal de retenção, monitoramento e revisão operacional são #6.
- Consultas adicionais e lookup têm custo: índices foram definidos, mas não foi realizado benchmark de carga/produção.
- Após #6, planejar limites simultâneos e outros reforços com o responsável; só depois CRUDs comerciais. Não antecipar esse escopo nem prometer segurança absoluta.
