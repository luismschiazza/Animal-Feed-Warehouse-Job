# #16 / 12.1 — Configuração de limites de sessões

## Desenho antes da implementação

Baseline conferida: main 96a58c1; #1–#6 CLOSED/Done, PR #11 integrada. Autorização desta execução: concluir SOMENTE #16. #17 (admissão atômica) e #18 (substituição) permanecem fora do escopo.

**Entrega integrada pela [PR #25](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/25)**. Implementação `0617249d09b73dae0d36e08d8a2be036c17f7c27`; merge `74def00b22a74828e101138638a2ce120c6670d2`. Todos os resultados abaixo foram repetidos com sucesso na main após merge, incluindo ambos os smokes reais. Só depois disso ocorre CLOSED/Done da #16.

- Limite empresarial padrão: 3 por identidade/organização. Configuração pertence à organização, não à conta global.
- Chave preparada: applicationId server-side + organizationId. Aplicação atual `animal-feed-warehouse`; CTA não integrado. Cliente não escolhe aplicação, organização ou usuário no endpoint.
- Contexto pessoal independente: valor NÃO definido; sem fallback empresarial e sem endpoint pessoal neste ticket.
- Matriz técnica explícita desta entrega: SYSTEM_ADMIN do vínculo ativo pode ler/alterar; OWNER/MANAGER isolados não herdam permissão, seguindo gestão de sessões #5. Papéis globais não concedem acesso.
- Faixa técnica de armazenamento/API: inteiros 1..100, não strings/decimais/null; limite 100 é proteção técnica desta configuração, não decisão sobre política pessoal. Revisão futura exige mudança versionada/testada. Zero não significa ilimitado.
- Versão inicial virtual 0, valor 3, leitura sem escrita. Cliente envia expectedVersion para alteração; incremento monotônico/CAS por índice único entre instâncias. Sem cache: leitura em primary por requisição. Valor persistido inválido falha fechado, nunca vira fallback silencioso.
- Revisões append-only: cada inserção contém valor anterior/novo, versão, ator/vínculo/papéis/correlação e horário. Efeito e recibo de mudança são UM documento atômico; o histórico não é um array ilimitado em um documento. Não é outbox/evento assíncrono da #21.
- Auditoria existente preservada no guard e serviço. Evento de conclusão adicional referencia a revisão. Se auditoria pós-inserção falhar, retornar indisponível, mas revisão pode existir: consultar versão antes de repetir; não prometer rollback entre coleções. O recibo inseparável do efeito permanece durável.
- Redução não revoga, remove ou modifica sessões/regras. Este ticket NÃO limita logins: #17 consumirá esta configuração para novas admissões. Se a quantidade superar o novo limite, sessões atuais continuam; bloqueio/seleção só será implementado nos tickets seguintes.
- Testes somente em MongoDB descartável, sem bancos/contas reais, sem email real.

## O que, como e por quê

Configuração versionada implementada, integrada e validada localmente na main; aceite rastreado na PR #25/issue #16. O índice único resolve disputa de atualização da configuração, NÃO a corrida de criação de sessões (#17).

### Arquivos e responsabilidades

- `schemas/session-limit-revision.schema.ts`: revisão imutável, chave BSON e índice único applicationId/organizationId/version. Sem TTL/DDL automática em TODOS os ambientes.
- `models/session-limit-model.module.ts`: registro do modelo, importado por AuthModule.
- `services/session-limit-configuration.service.ts`: autorização real reutilizando SessionManagementService, validação inclusive em chamada direta, leitura primary com readConcern majority, insert majority/journal e resposta por campos positivos.
- `controllers/session-limit-configuration.controller.ts`: GET/PATCH do singleton organizacional, DTO numérico e recusa de parâmetros de query. Não há ID de outra organização/aplicação para escolher.
- Registry/tipos/guard e SessionManagementService: recurso explícito `session_limit_configuration`, READ/UPDATE; revalidação de identidade, sessão, revogações autoritativas, conta, organização, vínculo e papéis. Não foi alterado o mecanismo de login/refresh/admissão.
- `SecurityAuditService` permanece o escritor existente; enum inclui evento de mudança de configuração. Recibo inseparável do efeito e evento geral de conclusão são complementares, não duas escritas fingidas como uma transação.

### Contrato HTTP

Prefixo real: `/api/auth/organization-session-limit`.

GET retorna somente scope=organization, applicationId=animal-feed-warehouse, organizationId do contexto autenticado, limit e version. Sem configuração: limit=3/version=0; não cria documento de política (auditoria da leitura continua existindo).

PATCH:
```json
{ "limit": 2, "expectedVersion": 0 }
```

Retorna nova versão 1. Os números precisam ser inteiros JSON, não strings. Alterar novamente exige expectedVersion=1; versão obsoleta ou disputa recebe 409, não sobrescreve silenciosamente. expectedVersion 0..2147483646; revisão máxima 2147483647, sem perda de precisão. Mudanças posteriores exigiriam revisão técnica ao alcançar o teto.

Headers de tenant/aplicação não trocam contexto. Query, campos extras, IDs, roles ou escopo no body são recusados. Pessoal recebe 403 neste endpoint administrativo: isso NÃO significa quota pessoal 0, 3 ou ilimitada. O valor pessoal continua pendente, isolado do contrato empresarial.

A política limita quem configura, não define o papel necessário para futuros logins. #17 precisará de um consumidor interno de configuração em contexto já validado; não pode obrigar um usuário comum a ser administrador para realizar login.

### Exemplo de concorrência

Duas instâncias leem versão 4. Ambas tentam inserir a versão 5 com a mesma chave de aplicação/organização. O índice único permite só uma; a outra recebe 409. Versões passadas nunca são atualizadas/removidas. Nova leitura consulta primary/majority, sem cache nem invalidação local a coordenar. Não usar relógio como versão.

### Operação deliberada (não executada no banco real)

Antes da primeira API com esta versão, operador provisiona coleção/índice usando credencial operacional separada:
```text
SESSION_LIMITS_MONGO_URL=<URI explicitamente escolhida> npm run session-limits:initialize
```

Não colocar URI/senha em Git ou comandos compartilhados. O CLI não carrega dotenv, não usa MONGO_URL como fallback, não cria contas ou valores de política, não imprime URI e não faz drop/reparo. Índice inexistente/incorreto ou TTL faz startup falhar fechado. Esse verificador não é monitoramento contínuo de operador root.

Runtime necessita somente find/insert/listIndexes em `session_limit_revisions`. Não conceder update/remove/drop/createIndex/collMod nem privilégios aditivos de banco inteiro. Inicializador usa DDL separado. As duas coleções de auditoria anteriores mantêm suas restrições. O teste ACL autenticado agora inclui a nova coleção, além das duas existentes: append/read permitidos, alteração/exclusão/TTL negados; leitor não insere. Isso é prova isolada, não configuração de produção.

Conservar revisões sem TTL/purga. O exportador geral da #6 continua exportando suas duas fontes existentes; o journal de configuração é fonte adicional a preservar no backup/operação da #14, não foi incluído silenciosamente em manifest antigo. Evento geral contém ID da revisão, não segredos/valores brutos de requests.

### Falhas e limites

- Insert de configuração e recibo é atômico em um documento, sem necessidade de replica set para esta operação; índice único deve existir.
- Erro antes de inserir não muda a configuração. Validador MongoDB recusando insert foi exercitado de verdade, com erro auditado e valor anterior preservado.
- Erro/timeout de rede pode ter confirmação incerta. Falha na auditoria após insert devolve indisponibilidade, mas versão/recibo já podem existir. Consultar versão após recuperação; repetir expectedVersion antigo conflita. Não prometer rollback ou exactly-once de resposta HTTP.
- Imutabilidade Mongoose não protege contra operador privilegiado. ACL reduz capacidades de runtime; comprometimento do escritor pode forjar inserts. Não é WORM/certificação.
- Snapshot de autorização não cancela operação já autorizada se estado mudar concorrente; garantias de revogação existentes foram preservadas.
- Quantidade de sessões pode exceder configuração nesta etapa; não fingir que #17 foi implementada. Redução conserva IDs, datas, hashes e regras existentes; seleção/substituição continua #18, sem remoção automática da mais antiga.
- Sem CTA, worker, broker, recuperação de senha, MFA, benchmark ou mudança nas #13–#15/#17–#24.

## Validação executada

| Verificação | Resultado local |
|---|---|
| Unitários | 245 testes / 20 suítes |
| HTTP e MongoDB real | 77 testes (65 regressões + 12 de configuração) |
| Vínculos/provisionamento | 13 testes MongoDB |
| E2E existente | 1 aprovado |
| AppModule real | DI, prefixo/envelope, login/auditoria, pessoal negado, GET padrão e PATCH versionado aprovados |
| ACL MongoDB autenticado + exportação CLI | append/read e startup com runtime restrito; update/delete/TTL/insert de leitor negados; exportador antigo preservado |
| Inicialização CLI | índice único verificado; zero configurações/contas criadas; banco isolado removido |
| Build, lint e TypeScript incluindo testes | Aprovados |

Casos específicos: defaults A/B independentes para a mesma identidade; sem configuração pessoal; dono/manager/auditor/customer e papel global sem bypass; campos/headers forjados; chamada direta com tenant ou roles falsos; conta/vínculo/organização suspensos; valores inválidos; redução sem tocar sessões/revogações; dez atualizações concorrentes em duas instâncias de serviço (uma sucessora); índice ausente/TTL; valor corrompido; falhas reais de insert e falha de auditoria pós-write sem duplicar por retry obsoleto.

Falhas encontradas durante execução: tipagem union do lean de modelo dinâmico corrigida com tipo explícito; o primeiro container efêmero não estava mais disponível após startup do Docker e a rodada de integração falhou por conexão. Recriado SOMENTE container de teste, repetidas suítes com sucesso; resultados acima são das rodadas finais, não desses erros iniciais.

Comandos: npm test -- --runInBand; npm run test:e2e -- --runInBand; npm run build; npm run lint; npx tsc --noEmit -p tsconfig.json. Integrações exigem SESSIONS_TEST_MONGO_URL/ABAC_TEST_MONGO_URL de MongoDB descartável; smokes usam SESSIONS_TEST_MONGO_URL e AUDIT_TEST_ADMIN_URL explícitas. Não usar MONGO_URL real. Bancos únicos sessions_test_*, abac_test_*, audit_root_test_*, audit_acl_test_* são descartados pelos testes; CLI foi exercitado em sessions_test_limit_init_*.

Sem CI remoto configurado; execução local não é certificação de produção, carga, multi-processo/failover. Concorrência foi comprovada em duas instâncias de serviço compartilhando MongoDB real, não em contagem/admissão de sessões.

## Próximo passo

#16 concluída e integrada; principal #12 e continuidade atualizadas. Execução encerrada: PARAR. Próximo ticket lógico é #17, não iniciado e não autorizado nesta execução. #12 continua aberta; #13–#15/#17–#24 permanecem no planejamento/Backlog. Nenhum banco, conta ou email real alterado; somente containers, usuários/papéis e bancos descartáveis dos testes.
