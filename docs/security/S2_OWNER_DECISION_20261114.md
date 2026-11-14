# S2: decisão expressa do proprietário e revisão inicial

## Autorização recebida

Recebimento registrado em **2026-11-14T02:06:42.000Z** nesta conversa. Este documento é a transcrição pelo agente de autorização expressa do proprietário, **não uma assinatura criptográfica independente ou alegação de que o proprietário escreveu este commit**.

> Aprovo a S2 temporária exclusivamente para os seis achados de desenvolvimento descritos na proposta, com os mesmos caminhos, versões, fingerprints e controles, até 14/11/2026 às 20:57:34.355 de Brasília.
>
> Antes de aplicá-la, confira novamente as fontes oficiais, os audits, o lock e as fingerprints. Se houver divergência, pare e me informe. Verifique também a PR oficial #11056, que propõe retirar o aviso do deepmerge.
>
> Estando tudo conforme, registre minha aprovação, aplique a S2 à PR #33 e execute o CI completo, preservando os gates e os resultados reais do npm audit. Informe como será feita a revisão manual a cada 24 horas.
>
> Não faça merge nem deploy. Traga os resultados para minha decisão.

Referência da proposta revisada: PR #33 HEAD `d43521c88e6367768d4edb403a73e53401717727`, proposta local selada `issue28-s2-proposal-owner-decision-20261111`, `diff-proposal-final.patch` e `snapshot-final.json`. A autorização permite publicar os arquivos propostos com este registro e os metadados de aprovação; não permite mudar o escopo nem renovar S1.

## Prazo e escopo que NÃO mudaram

- Proposta: `2026-11-11T23:57:34.355Z`.
- Vencimento absoluto: **2026-11-14T23:57:34.355Z**, ou **14/11/2026 às 20:57:34.355 de Brasília**.
- Janela original de 72 horas; o aceite tardio **não reinicia nem amplia** a janela.
- S1 continua arquivada, byte-idêntica, vencida em `2026-11-10T22:09:20.702Z`.
- Somente `@jest/core`, `jest`, `jest-cli`, `jest-config` 30.5.2, `deepmerge` 4.3.1 e `ts-jest` 29.4.15: seis LOW dev de um originador propagado, não seis CVEs.
- Mesmos caminhos, grafo, versões, findings, lock, payload, registros e fingerprints da proposta. Nenhum refresh de pins, advisory adicional, mudança de dependência/override ou árvore corrigida é autorizado.

## Preflight da revisão inicial, ANTES da aplicação

Evidências novas em `D:/programacao/documentos/issue28-s2-authorization-preflight-20261114`, incluindo `AUTHORIZATION.md`, `preflight.json`, `official-retry/`, `research/` e `audit/`. Os 231 hashes da evidência anterior foram verificados somente para leitura, sem reexecutar seus wrappers/finalizadores.

A captura original do NVD atingiu o limite original de 15 segundos e foi preservada. Uma única nova captura completa, em diretório novo e com os mesmos limites, retornou **HTTP 200 para CNA, NVD e GHSA**, sem fallback, alterações de clock ou afrouxamento de checks. Os registros, lock de host/imagem, payload e findings coincidiram integralmente com os pins aprovados. Git/PR/main e diff previamente revisado também conferiram.

- CNA `REJECTED`, NVD `Rejected`.
- GHSA-gcqx-w48m-w2h4 **ativo**, `withdrawn_at: null`, sem primeiro patch reconhecido.
- Produção: **zero / exit real 0**.
- Completa: **seis LOW dev / exit real 1**, nenhuma moderate/high/critical.
- JSON, stdout/stderr e códigos reais preservados. Disposição S2 não muda o exit do npm audit nem significa auditoria completa limpa.

### PR upstream #11056

https://github.com/github/advisory-database/pull/11056

Na consulta inicial deste aceite: **OPEN, `merged: false`, `merged_at: null`**, head `f579883d399ab2f36399cfdb61a3ef9121db6517`. A alteração proposta adiciona `withdrawn` ao advisory e explica a CVE rejeitada. Dois checks tiveram sucesso. Isso **não** é merge, retirada publicada ou sincronização do npm. Um `merge_commit_sha` virtual e checks verdes não substituem `merged: true` nem o GHSA oficial atual. Não usar o JSON proposto na PR como fonte oficial vigente.

## Revisão manual: responsável, horários e procedimento

**Responsável:** proprietário do repositório; um delegado só assume mediante identificação explícita. O agente pode executar e registrar uma nova rodada quando acionado, mas **não permanecerá monitorando autonomamente**. Nenhum scheduler, lembrete, alerta automático ou serviço foi ativado.

A revisão inicial foi realizada nesta execução, com fontes e audits em torno de **14/11/2026 02:09 UTC**, e deve ser complementada pelos artefatos do CI completo do HEAD publicado. A frequência máxima é 24 horas e também antes de qualquer integração autorizada. **A próxima marca de 24 horas cairia após o vencimento**, portanto o próximo ponto obrigatório é antecipado para **no máximo 14/11/2026 23:57:34.355 UTC**, quando a S2 deixa de ser utilizável. Não esperar até dia 15, não estender o prazo e não usar CI verde anterior como extensão. Se houver integração proposta antes disso, revisar imediatamente antes.

Checklist a registrar em **nova evidência**, sem sobrescrever a anterior:

1. Data UTC, responsável, HEAD/base/tree/CI e situação da PR #11056, incluindo estado real de merge e alterações propostas.
2. Captura oficial CNA/NVD/GHSA com URLs/HTTP/integridade, frescor máximo de uma hora e controles originais; conferir estado, registros, EPSS e primeiro patch. Não presumir retirada por checks ou merge upstream isoladamente.
3. Audits produção e completo com JSON/stdout/stderr e exits reais. Conferir exatamente 0/1 e os seis LOW dev, versões/caminhos/grafo, findings, lock e payload pinados. Produção zero não equivale a full limpo.
4. Registrar decisão **manter até o prazo original, interromper/revogar, ou clean sem exceção**, com justificativa e referência das evidências. Qualquer diferença, fonte falha/vencida, finding novo/produção/severidade, alteração de pacote/metadata/payload/lock ou impossibilidade de revisar implica parada; não recalcular fingerprints nem expandir escopo.
5. Se GHSA oficialmente retirado **e** audits realmente zero/exits 0/0 e demais checks válidos, usar o caminho PR #33 sem exceção; aposentadoria do perfil exige revisão separada. Retirada com feed ainda contendo seis deve bloquear, não continuar usando S2.
6. No vencimento ou revogação: bloquear. Uma nova janela exigiria outra proposta e autorização; este aceite não permite renovação automática. Não há permissão de merge/deploy neste registro.

O classificador verifica prazo e fontes em cada execução, mas isso não constitui monitoramento contínuo nem substitui a responsabilidade manual. A review humana deve avaliar os resultados reais e a confiança em código, CI, produtor e relógio; campos de aprovação não autenticam criptograficamente a identidade do proprietário.

## CI e decisão posterior

Publicar commit normal na PR #33, mantê-la draft e executar os três jobs originais, incluindo Mongo/ACLs/mTLS Ubuntu e demo Linux completo. Não alterar needs, gates, thresholds, assertions, failpoints ou timeouts. Exigir identidade do HEAD/tree e artifacts; manter full exit 1/6 LOW e disposição `policyId: S2`, `localExceptionApplied: true` explícitos se o quadro continuar igual.

Se houver divergência no CI, parar e apresentar o bloqueio, sem refresh de pins ou bypass. Mesmo com todos os jobs aprovados, apresentar os resultados para **nova decisão do proprietário**. **Sem merge e sem deploy.**
