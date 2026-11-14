# S2: proposta aprovada temporariamente — prazo original preservado

**Aprovada expressamente pelo proprietário em 14/11/2026, após preflight conforme. Não renova S1 e não autoriza merge ou deploy.**

Registro da decisão, evidências e responsabilidade da revisão manual: [S2_OWNER_DECISION_20261114.md](S2_OWNER_DECISION_20261114.md). Abaixo permanece a descrição do desenho proposto sobre a correção da PR #33 (`d43521c`), agora autorizada para aplicação nessa PR e execução do CI completo.

## Decisão solicitada e prazo

A decisão expressa aprovou uma **nova exceção S2**, somente para os seis achados LOW de desenvolvimento já revisados. O arquivo `scripts/ci/audit-discrepancy-s2-proposal.json` registra `APPROVED_TEMPORARY_BY_OWNER` e a referência da decisão. No estado anterior `PENDING_OWNER_APPROVAL`/`approval: null`, preservado nas evidências da proposta, o seletor mantinha a S1 original e recusava por expiração. A S1 continua vencida; esta decisão nova não a renova.

- Proposta e revisão: **2026-11-11T23:57:34.355Z**.
- Prazo absoluto sugerido: **2026-11-14T23:57:34.355Z**, ou **14/11/2026 às 20:57:34.355 de Brasília**.
- São 72 horas desde a proposta, **não desde o aceite**. Aprovação tardia apenas reduz a janela; depois do prazo, parar e solicitar outra proposta/decisão.
- A S1 permanece imutável e vencida desde **2026-11-10T22:09:20.702Z**.

Não há ativação por argumentos, variáveis de ambiente, conteúdo dos audits ou respostas oficiais. A aprovação foi registrada no código-fonte confiável somente depois da decisão expressa e do preflight sem divergência. Qualquer mudança posterior continua exigindo parada/revisão; não há refresh automático.

## Escopo exato e justificativa

Um originador de feed, **GHSA-gcqx-w48m-w2h4 / CVE-2026-93753**, propagado por:

- `@jest/core`, `jest`, `jest-cli` e `jest-config`: **30.5.2**;
- `deepmerge`: **4.3.1**;
- `ts-jest`: **29.4.15**.

Não são seis CVEs. Pacotes, caminhos, versões, severidade LOW, chains, findings, lock, payload e registros CNA/NVD/GHSA ficam exatamente pinados ao perfil já revisado. O novo seletor exige correspondência dos pins S2 com os pins S1 arquivados. A análise do grafo verifica ausência de alcançabilidade por produção, não apenas a marca `dev`.

Nas consultas e audits novos, CNA está **REJECTED** e NVD **Rejected**, mas GHSA permanece ativo, com `withdrawn_at: null` e `first_patched_version: null`. Produção retorna **0/exit 0**; auditoria completa, **6 LOW dev/exit 1**. Todos os fingerprints continuam iguais. O registry mantém deepmerge 4.3.1 e jest-config 30.5.2 com `deepmerge: ^4.3.1`; não foi identificada correção oficial reconhecida.

A justificativa é uma ponte curta e explicitamente aceita para a discrepância entre feeds após nova revisão. **Não é patch, prova de ausência de vulnerabilidade ou auditoria completa limpa.** A rejeição da CVE não equivale à retirada do GHSA.

## Controles obrigatórios se houver autorização posterior

1. **Decisão rastreável:** alterar o status para `APPROVED_TEMPORARY_BY_OWNER` somente após autorização expressa; registrar `approvedBy`, `approvedAt` e `decisionReference` reais. A data deve estar entre proposta e prazo, não ser futura e ser anterior ao vencimento. Os textos têm limites e não podem estar vazios. Não usar fixtures ou preloads como aprovação real.
2. **Janela fixa:** o código exige duração exata de 72 horas e proposta posterior à expiração S1. Não há janela derivada de `Date.now()`, extensão automática ou clock/selector via CLI/env. Replays históricos preservam a janela original S1 sem retroagir a autorização S2. S2 expirada falha; revogação retorna à S1 já vencida, não a outro waiver.
3. **Audits reais:** JSON v2 válido, contagens consistentes, ausência de erro de infraestrutura e exits reais. Produção deve permanecer zero. A exceção só admite exatamente os seis LOW dev e exits **0/1**; qualquer achado de produção, novo advisory ou alteração de severidade, versão, caminho, chain ou metadata bloqueia.
4. **Preservação explícita:** guardar stdout, stderr, JSON e códigos originais. A disposição excepcional deve informar `policyId: S2`, `localExceptionApplied: true`, prazo e warning honesto. O `npm audit` completo continua com exit 1 e não pode ser chamado de limpo.
5. **Fontes por execução:** URLs fixas, HTTP 200, integridade, idade máxima de uma hora e tolerância futura de 60 segundos. CNA/NVD rejeitados e pinados; GHSA LOW revisado, faixa exata, sem primeiro patch e registro inteiro pinado, inclusive EPSS. Falhas HTTP, evidência vencida ou qualquer atualização bloqueiam, sem cache fallback ou refresh automático.
6. **Árvore imutável:** lock, payload, findings, versões e grafo continuam exatamente revisados. Nenhuma nova dependência, remoção de override ou fingerprint é autorizada por esta proposta. Uma árvore corrigida exige revisão e autorização separadas.
7. **CI original:** preservar quality, demo-linux e mongo-integration com `needs: quality`, sem alterar thresholds, timeouts, failpoints ou assertions. O workflow muda apenas o texto do warning e a provisão readonly do arquivo exato do checkout como fixture do teste estrutural, pois `.github` é excluído da imagem. Não remover ou condicionar essa assertion; os demais gates e comandos permanecem. O warning não deve atribuir S2 à S1 vencida.
8. **Revisão humana:** proprietário ou delegado responsável deve revisar fontes e situação ao menos a cada 24 horas, além da coleta fresca por execução do CI. Não foi ativado monitor, alerta ou scheduler. A janela inclui fim de semana; se não houver responsável disponível para manter o controle, revogar/parar.

O registro de decisão no código pressupõe produtor, CI, relógio e revisão confiáveis. `approvedBy` e `decisionReference` **não são assinatura independente nem autenticação criptográfica da identidade do proprietário**. Nenhuma proteção de branch foi configurada nesta entrega.

## Condições de retirada ou interrupção

- **Retirada oficial + feeds sincronizados:** GHSA oficialmente retirado, produção e completa realmente zero, exits 0/0 e todos os controles aplicáveis válidos. O caminho corrigido pela PR #33 retorna `clean-after-official-withdrawal` e `localExceptionApplied: false`, mesmo após os prazos. A aposentadoria dos arquivos/perfis deve ser revisada separadamente.
- **Remediação oficial reconhecida:** patch ou consumer oficial que elimine o achado permite propor outra árvore em entrega autorizada separadamente, com lock, contratos, regressões, audits 0/0 e CI. Este perfil não valida genericamente uma nova árvore; não atualizar pins automaticamente.
- **Qualquer mudança relevante:** novo advisory, achado de produção, severidade ou delta dos seis, alteração de GHSA/CVE/NVD/EPSS/fixAvailable, fontes falhas/vencidas, lock, payload, versão, caminho ou chain implica bloqueio e nova revisão, não ampliação da S2.
- **Prazo ou revogação:** interromper no primeiro desses eventos. Status `REVOKED` ou rollback da proposta retorna à PR #33/S1 vencida. Não renovar datas silenciosamente.

## Riscos e limites

O achado ativo de dependência de desenvolvimento permanece. A toolchain executa código e pode consumir entradas não confiáveis; conforme o uso, há exposição de disponibilidade, CPU/memória e dados do executor. Não foi demonstrada exploração em produção nem não explorabilidade absoluta. CNA rejeitado não prova inexistência de falha.

Uma mudança apenas de metadata pode bloquear o pipeline antes de 72 horas devido aos pins estritos. A janela já está correndo e pode vencer antes da aprovação. Não há garantia de sincronização dos feeds nesse período.

O modelo existente de confiança em código/CI/clock e revisão permanece uma limitação. CI verde não certifica sistema operacional, backups, governança ou produção e não autoriza merge, deploy ou fechamento de outras issues.

## Plano para concluir a PR #33 — condicionado à decisão

1. Revisar o diff combinado main + correção PR #33 + proposta S2 e os resultados oficiais. Até a decisão, manter a PR em draft, HEAD `d43521c`, com gate bloqueado.
2. **Se houver autorização expressa dentro do prazo:** registrar a decisão real e promover a proposta à PR #33 com commit normal, sem force/bypass, preservando S1, pins e prazo. Conferir HEAD, base e tree exatos.
3. Capturar novamente fontes e audits. Somente uma S2 explicitamente aprovada e ainda válida pode dispor os seis achados; o full exit 1 deve continuar preservado nos artefatos. Qualquer delta exige parada.
4. Executar o workflow original completo: quality com políticas, lint, types, build, unit, CLI, E2E, coverage, assets e tree; demo-linux completo; Mongo com 248 HTTP, 13 ABAC, AppModule/admin CLI/admission, ACLs de audit/replacement/produtos e **mTLS Ubuntu/negativos**. Exigir os três jobs e todas as etapas aprovados no SHA exato, com cleanup, artifacts e identidade de tree/parents conferidos.
5. Apresentar resultados para **outra autorização explícita de merge**. Revalidar prazo, fontes/audits, HEAD e CI imediatamente antes da integração: um CI que passou antes do vencimento não estende a exceção se ela expirar durante o job ou a revisão. Deploy requer decisão separada.

Sem aprovação, com expiração ou mudança das condições, manter o gate bloqueado. Não iterar datas, hashes, clocks ou thresholds para obter verde.

Os testes da proposta usam aprovação **SIMULADA**, apenas em memória ou cópias descartáveis de teste. Isso não aprova a exceção real nem equivale a CI remoto verde. Os testes Mongo locais em fixtures novas e comprovadamente próprias são diagnósticos preparatórios, não bypass do `needs: quality`.
