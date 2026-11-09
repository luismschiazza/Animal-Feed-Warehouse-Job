# Ambiente comercial descartável (issue #31)

Ferramenta **somente de desenvolvimento/teste**, explícita e separada do startup. Requer o toolchain de desenvolvimento definido em `package.json`, `npm ci` e Docker Engine Linux local (Docker Desktop também serve). Não funciona no contêiner de produção, sem dependências de desenvolvimento ou contra Docker remoto. Não altera o esquema de usuários, autenticação, permissões ou sessões do aplicativo. Não faz merge, deploy ou provisionamento de loja real. A prova de propriedade protege contra acidentes em um host de desenvolvimento confiável; manifesto local/ACL/Docker não são uma assinatura externa nem defesa contra operador malicioso, administrador do host/daemon ou máquina comprometida.

## Caminho simples

Na raiz do repositório:

```sh
npm ci
npm run demo:create -- --name loja-demo
npm run demo:status -- --name loja-demo
npm run demo:start -- --name loja-demo
```

`demo:create` constrói a imagem MongoDB fixada em `docker/mongodb.Dockerfile`, cria **um novo contêiner autenticado com replica set**, volumes anônimos novos, porta aleatória publicada somente em `127.0.0.1`, e popula usuários/organizações/vínculos/produtos. Não recebe URI, nome de banco externo ou volumes preexistentes. Docker `DOCKER_HOST`/TLS externo e contextos remotos são recusados, assim como `NODE_ENV=production`/ambiente desconhecido. `NODE_ENV`, prefixo de banco ou localhost sozinhos NÃO constituem a prova: são conferidos ID completo do contêiner, imagem, labels, mounts e porta contra o manifesto privado.

`demo:start` anuncia uma URL local `/api`, mantém a API no foreground e conserva o lock até parar digitando `stop` + Enter (ou Ctrl+C no terminal). Usa os módulos existentes de usuários/auth/organizações/autorização/produtos, validação, guardas e sessões reais, **não o AppModule escolar completo**, sem SMTP. Não oferece Swagger/frontend nesta primeira entrega. Enquanto a API estiver aberta, outros comandos desse mesmo ambiente recusam o lock; pare a API para conferir/repetir/descartar.

Os nomes são explícitos, minúsculos e limitados (`loja-demo`); `demo:create` recusa qualquer diretório/nome existente, mesmo parcialmente criado ou já descartado. Não adota, renomeia, corrige ou substitui um ambiente. Escolha um novo nome para um novo cenário.

Os arquivos privados ficam, por padrão, em `../Animal-Feed-Warehouse-demo-environments/<nome>` fora do repositório. `AFW_DEMO_HOME` pode escolher outra pasta **externa** dedicada. Em POSIX, exigem dono atual e 0700/0600; no Windows, ACL exclusiva do usuário é aplicada/conferida via PowerShell ANTES de escrever segredos. Se não for possível comprovar acesso privado, o comando falha. Não use compartilhamentos, sincronização em nuvem ou controle de versão para essa pasta. Não altere TEMP/TMP globais.

## Credenciais e login

`credentials.json` é a entrega privada local: senhas aleatórias CSPRNG por conta, senha administrativa/runtime Mongo e segredo JWT exclusivo da instância. **Não existem senhas fixas públicas.** O terminal imprime somente a localização do arquivo, nunca valores, hashes, tokens ou URI. Abra o arquivo localmente com um editor confiável; não use `cat`, screenshots, `Get-Content`, histórico de shell, tickets ou logs para compartilhar seu conteúdo. O perfil/valor em `userPasswords` corresponde ao login `<nome>.<perfil-em-minúsculas>@example.test`.

`demo:status` informa os IDs das organizações A e B sem segredos. Faça `POST /api/auth/login` com `email`, a senha do arquivo e `organizationId` para sessão da loja. O perfil `personal` autentica sem `organizationId` e não acessa catálogo de loja. Não são fabricados JWTs nem actors: o povoamento autentica o proprietário, valida sua sessão no serviço existente e chama `ProductsService` com essa identidade.

## Cenários existentes, sem estoque fictício

São 15 contas e duas organizações fictícias, A e B. Todos os documentos de usuário conservam `roles=[CUSTOMER]`; os papéis de loja pertencem aos memberships existentes, não a um novo tipo de usuário:

- Uma conta por papel atual: `SYSTEM_ADMIN`, `ORGANIZATION_OWNER`, `MANAGER`, `INVENTORY_OPERATOR`, `SALES_ASSOCIATE`, `CASHIER`, `PURCHASING_AGENT`, `FINANCIAL_ANALYST`, `AUDITOR` e `CUSTOMER`, com vínculo ativo em A. O proprietário também possui vínculo de proprietário em B para o povoamento legítimo dos dois catálogos.
- `shared`: MANAGER em A e AUDITOR em B; não herda privilégio de uma organização na outra.
- `personal`: conta ativa sem vínculo.
- `suspended`: conta suspensa, com vínculo que não reativa a conta.
- `revoked`: conta ativa com vínculo revogado em A.
- `membership-suspended`: conta ativa com vínculo suspenso em A.

São 16 vínculos e seis produtos, três por organização com os mesmos SKUs entre A/B para exercitar isolamento:

- `RACAO-FECHADA-15KG`, unidade fechada, preço inteiro BRL 18990 centavos e `packageWeightGrams=15000`.
- `RACAO-GRANEL`, venda por kg, preço 1290 centavos/kg, sem peso de pacote.
- `PETISCO-ENCERRADO`, produto descontinuado, unidade, 990 centavos.

**Nenhum saldo, lote, movimento, abertura ou conversão é criado.** São dois cadastros de ração independentes. A alternativa A escolhida para entrega futura ligará saco fechado e granel por uma operação atômica explícita de abertura, com origem/baixa/entrada e sem dupla contagem; `packageWeightGrams` não realiza conversão automática.

O provisionador administrativo é interno à ferramenta dev, sem endpoint: usa schemas existentes, bcrypt custo12, transação para organizações/contas/vínculos/manifesto/auditoria de provisionamento. Não usa signup para escalar papéis e não reutiliza `bootstrap:organization` como criador genérico de lojas. A aplicação demo opera com um principal Mongo restrito; somente o operador dedicado pode preparar schemas/índices/grants/checkpoints.

## Comandos conhecidos, repetição e dry-run

A conveniência antiga é preservada com proteção obrigatória de destino:

```sh
npm run cli -- seed --name loja-demo --module users --limit 15
npm run cli -- seed --name loja-demo --module products --limit 6
npm run cli -- seed --name loja-demo --module demo
npm run demo:seed -- --name loja-demo --dry-run
npm run demo:create -- --name outra-loja --dry-run
```

`-m`/`-l` continuam aceitos. Nesta primeira versão o dataset é fixo: `users=15`, `products=6`, `demo=21` (contas+produtos, não contagem de vínculos). Omita `--limit` ou informe o valor exato; valores diferentes, zero, negativos, excessivos e decimais falham, sem seed parcial aleatório. `demo:create --module users` prepara somente contas/organizações/vínculos; `seed --module products` exige essa base já comprovada. `demo` é o padrão e executa ambos. Os seletores escolares e de mail são recusados, não redirecionados silenciosamente. Os providers legados individuais também receberam uma recusa antes de acessar suas dependências.

O despacho da CLI é validado **sem importar AppModule**, tanto em fonte quanto compilado. Apenas `seed` e `generate:jwt-secret` são subcomandos reconhecidos; nomes são case-sensitive. `Seed`, comandos/flags desconhecidos, argumentos administrativos extras e prefixos inválidos falham sem bootstrap de aplicação/configuração/banco. O manager valida todos os argumentos de `seed` antes de qualquer conexão e não lê `.env` nem usa `MONGO_URL`/credenciais SMTP herdadas como fallback.

`npm run cli -- --help`, `--help seed`, `help seed`, `seed --help` e a ajuda de `generate:jwt-secret` são locais: não carregam Nest/config/banco, não leem ou alteram `.env` e nunca executam o comando, mesmo com opções adicionais. Sem argumentos, a CLI mostra a ajuda. Comando desconhecido continua recusado mesmo com `--help`.

`generate:jwt-secret [-f|--force]` preserva o provider administrativo existente, em um módulo mínimo sem banco/mail: atua somente na `.env` do diretório atual e mantém a necessidade de force explícito para substituir valor não vazio. Os demais comandos administrativos npm (`bootstrap:organization`, auditoria, inicializadores de produtos/sessões) continuam scripts separados, inalterados; não são aliases no main-cli e não adquiriram a prova de ambiente descartável desta ferramenta.

Teste adicional: após `npm run build`, execute `npm run test:cli-safety`. Processos reais fonte/compilado usam `.env` fictício privado e hooks que registram/bloqueiam imports de AppModule/config/Mongoose/SMTP, conexões e subprocessos. Os testes exigem zero tentativas, não apenas exit code de erro; geração administrativa é exercitada em arquivo privado próprio, nunca na `.env` do projeto.

Para executar compilado, faça `npm run build` e defina `AFW_DEMO_COMPILED=1` apenas nesse processo; ou use `node dist/main-cli.js seed --name loja-demo -m demo`. Para os scripts `demo:*`, `AFW_DEMO_COMPILED=1` seleciona o runner compilado. O padrão é fonte via ts-node instalado no desenvolvimento.

Repetir confere identidades, conteúdo e digests do manifesto, dados de organizações/usuários/vínculos e proveniência de produtos. Não sobrescreve documentos, reativa contas, redefine senhas ou repara dados divergentes. Um segundo `demo:create` nunca substitui o primeiro. Dados alterados pelo uso manual da API ocasionam conflito deliberado no seed/validação; o operador os preserva e inspeciona, não faz reset automático.

O dry-run de criação não cria diretórios/contêineres nem conecta banco. O de seed comprova ambiente e lê o dataset, sem modificar registros ou autenticar. A operação pode criar/remover seu lock privado local; não equivale a uma transação de escrita no banco.

## Falhas, locks e recuperação

Não se promete uma transação única para todo o dataset: o provisionamento de contas é uma transação; cada produto+auditoria usa a transação de `ProductsService`; grants e checkpoints são etapas separadas. Falha/timeout não significa rollback.

Após falha de produto, execute novamente `demo:seed` no **mesmo nome**. Um produto já committed antes de perder o checkpoint é aceito somente se conteúdo exato, usuário/organização, requestId e evento de conclusão coincidirem. Não é adotado apenas porque o SKU existe. Conteúdo, IDs ou eventos incompatíveis geram conflito, sem sobrescrita ou duplicação.

Falha entre o commit administrativo e a preparação do principal Mongo pode exigir inspeção administrativa explícita; esta versão **não repara silenciosamente roles/users/índices**. Interrupção antes de persistir um ID de contêiner também exige inspeção do recurso recém-criado/labels, sem adoção ou remoção por nome. Não apague dados para tornar a repetição verde. Ambientes com estado/grants desconhecidos permanecem preservados; use outro nome para novo cenário.

O lock é exclusivo por diretório e validado pelo runner filho antes de conectar. Concorrência falha sem escrever; locks órfãos de encerramento abrupto não são retomados por tempo. Para liberá-los, primeiro comprove que o PID/proc do `operation.lock/owner.json` e seus filhos pararam (PID pode ter sido reutilizado); só então remova **esse lock**, conscientemente. Não remova o manifesto nem credenciais para forçar adoção. `demo:start` encaminha os sinais recebidos e espera o filho encerrar para liberar o lock; `stop` + Enter é o caminho explícito portátil. No Windows, matar o supervisor via `process.kill(SIGTERM)`/Task Manager é encerramento forçado, não um sinal tratável: pode deixar filho e lock que exigem a inspeção descrita acima. O teste usa `stop` e confirma que a operação terminou sem lock órfão.

## Descarte separado, com confirmação

```sh
npm run demo:destroy -- --name loja-demo --dry-run
```

Depois de conferir o destino, repita o comando com `--confirm <ID-COMPLETO-IMPRESSO>`. Sem confirmação exata não há exclusão. O comando reconfere propriedade/imagem/mounts/porta e integridade do dataset antes de `docker rm -f -v` **somente do contêiner próprio e seus volumes anônimos**. Dados desconhecidos/conflitantes, bancos adicionais além do próprio e dos internos do Mongo, permissões divergentes, ambiente parado/ID substituído ou prova insuficiente recusam descarte; não existe `--force`, `dropDatabase` genérico ou limpeza do journal de uma loja.

O diretório privado, credenciais e marcador `destroyed.json` ficam preservados para descarte explícito do operador; não são apagados silenciosamente. Após conferir que o contêiner foi realmente removido e que não há material relevante a preservar, descarte esses arquivos privados próprios com segurança. Não reutilize as credenciais em qualquer ambiente. Nunca use essa ferramenta como backup/restauração ou inicializador de produção.

## Testes

`npm run test:demo-safety` testa parser, bounds, recusa de seletores, prova de contêiner/porta/mount/imagem e locks/armazenamento privado, sem Mongo. Os unitários também verificam recusa antes de conectar e providers escolares/SMTP desativados. O CI de qualidade executa esse gate adicional sem enfraquecer os existentes.

`npm run test:demo` constrói e testa a ferramenta completa com Docker local. Usa uma subpasta nova e única de `AFW_DEMO_TEST_HOME` ou do temporário **do processo**, nunca `AFW_DEMO_HOME` do desenvolvedor nem um destino externo. Cria somente contêineres novos; testa fonte/compilado, repetição, senhas preservadas, cenários de autenticação/ABAC, conflitos, concorrência, fail-on-send SMTP, interrupção pós-commit, retomada e descarte. Segredos/URIs/hashes/tokens são confrontados em memória contra o output capturado, sem imprimir valores. No sucesso, descarta seus contêineres e somente os três arquivos privados conhecidos de cada ambiente; falha preserva o próprio material para diagnóstico. Execução completa Docker não é disparada no startup nem dentro do job de qualidade `--network none`. O job independente `demo-linux` executa os guards e o fluxo completo em host Ubuntu24.04: extrai Node24.22.1 e dependências da imagem development fixada, copia os testes do checkout e executa o runner nativamente no host com Docker local, sem socket montado, Docker-in-Docker ou toolchain nova não fixada. Registra head/base/merge testado e identidade da imagem. Não substitui os gates quality/mongo-integration; confira todos os resultados do CI para o HEAD em revisão.

Os artifacts do job contêm apenas relatórios top-level sanitizados, nunca a pasta privada de credenciais. No sucesso, o teste já descarta os próprios ambientes. O teardown adicional é restrito ao fixture efêmero do job Actions, com raiz temporária exata, IDs/manifestos/guard conferidos e sem lock ativo. Não é um `--force` disponível ao desenvolvedor e não aceita um destino externo. Em prova insuficiente, recusa e preserva até a VM efêmera do runner ser descartada.
