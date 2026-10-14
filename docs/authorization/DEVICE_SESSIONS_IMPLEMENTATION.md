# Issue #2 — Sessões por dispositivo: implementação e validação

Issue: https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/issues/2

## Estado da entrega

**Concluída e integrada à main pelo [PR #7](https://github.com/luismschiazza/Animal-Feed-Warehouse-Job/pull/7), commit cd31d07.** Issue #2 encerrada após aceite. Login, refresh, JWT e logout utilizam o novo serviço; não é uma declaração de implantação em produção.

O histórico original da main (README/licença) foi unido à branch de implementação com merge de históricos distintos, preservando os commits e LICENSE, sem force-push. O conflito de README foi resolvido mantendo a documentação completa da aplicação e referenciando a licença original. Aceite confirmado após integração, com repetição dos testes MongoDB/HTTP e E2E sobre a base integrada.

## O que foi feito, como e por quê

### 1. Sessão separada do usuário

`src/features/auth/schemas/auth-session.schema.ts` define `auth_sessions`, com dono, identificador público, verificador atual, consumo de tokens, versão, datas, expiração, revogação e metadados limitados.

Cada login cria um documento. Isso remove a dependência de uma única credencial global por usuário, permitindo celular e computador independentes. IP/user-agent são metadados, não garantias de identidade física do aparelho.

Índices: sessionId único, consulta por userId e TTL em expiresAt. TTL só limpa; a aplicação verifica expiração explicitamente. Verificadores são excluídos da seleção comum e de toJSON/toObject. Consultas lean/projeções podem contornar transformações; futuros endpoints devem retornar DTOs permitidos, nunca documentos brutos.

### 2. Credenciais criptográficas

`src/features/auth/tokens/refresh-token.ts` gera UUIDs v4 e segredo de 32 bytes aleatórios com node:crypto. Formato: `sessionId.tokenId.secret`, 117 caracteres. Parser exige três partes, UUIDs v4 e base64url canônico.

SHA-256 verifica o segredo inteiro. Não se usa bcrypt para o refresh: o token é aleatório e o formato anterior ultrapassava o limite de entrada de bcrypt. Senhas continuam com bcrypt. Tokens brutos não são persistidos.

### 3. Rotação atômica e replay

`src/features/auth/services/auth-sessions.service.ts` faz criação, busca ativa, revogação e rotação.

Uma findOneAndUpdate condicional exige identificador/hash atuais, sessão ativa e contador abaixo do limite. A escrita substitui o verificador, incrementa a versão e adiciona a credencial consumida no mesmo documento. Essa atomicidade não exige transação entre collections nem replica set.

Se a troca não ocorrer, revogação por replay exige elemMatch de tokenId e hash consumido. Segredo incorreto com identificador conhecido não basta para derrubar a sessão. A sessão é o agregado da família; não é necessário um familyId separado.

Expiração absoluta: sete dias. Refresh não estende expiresAt. Histórico retido até a expiração, limitado a 1.000 rotações. Ao atingir o limite, somente uma credencial atual válida pode revogar com motivo rotation_limit; exigir novo login. Não apagar verificadores antigos para abrir espaço, pois isso perderia evidência de replay.

A política é estrita: duas apresentações concorrentes podem deixar uma chamada vencedora, seguida da revogação da família. O cliente precisa coordenar refresh single-flight, inclusive entre abas. Se a resposta de um refresh se perder, repetir o token anterior pode exigir novo login. Não foi implementada tolerância/idempotência de refresh.

### 4. Integração com autenticação

- `auth-sessions.module.ts` e `models/auth-session-model.module.ts`: encapsulam persistência e disponibilizam o serviço.
- `auth.module.ts`: importa o módulo de sessões; fallback do access token passa a 15 minutos.
- `services/auth.service.ts`: login cria sessão; refresh rotaciona e revalida sessão/usuário; logout revoga somente sid do usuário autenticado.
- `interfaces/jwt-payload.interface.ts`: inclui sid.
- `strategies/jwt.strategy.ts`: exige sub/sid, confirma dono/estado/expiração no banco e consulta os dados atuais do usuário. Não confia nos papéis antigos do JWT.
- `controllers/auth.controller.ts`: repassa metadados observados pelo servidor e o sid autenticado ao logout.
- `users.service.ts`: removidos métodos de leitura/escrita do hash global legado.

Resposta mantém access_token/refresh_token e os aliases accessToken/refreshToken, adicionando session_id. O contrato continua usando body/bearer; não houve migração silenciosa para cookies.

Logout bloqueia o próximo acesso mesmo com JWT não expirado. Requisições que já passaram pela autorização não são canceladas retroativamente. Não há cache de sessão nesta implementação. Indisponibilidade do banco não permite fallback de acesso.

### 5. Migração e configuração

- JWTs antigos sem sid e refresh tokens antigos são rejeitados. Usuários precisam fazer novo login após implantação.
- O campo refreshTokenHash no schema do usuário permanece apenas para ocultar verificadores de registros legados. Nenhum caminho de autenticação o utiliza.
- Limpeza opcional de hashes legados deve ser planejada após backup e confirmação no ambiente correto; não foi executada alteração em banco da aplicação.
- `.env.example` e README recomendam JWT_EXPIRES_IN=15m. Configuração existente do usuário não foi alterada; uma configuração explícita continua prevalecendo.
- TTL da sessão e máximo de rotações são constantes explícitas de sete dias e 1.000. Eventual parametrização precisa de validação de limites.
- Um JWT pode declarar expiração posterior ao término da sessão; a sessão continua sendo o limite efetivo de acesso. expires_in informa o JWT, não estende a sessão.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `npm test -- --runInBand` | 10 suítes, 36 testes unitários aprovados |
| `npm run test:sessions` com servidor de teste | 11 testes reais de integração/HTTP aprovados |
| `npm run test:e2e -- --runInBand` | 1 teste E2E existente aprovado |
| `npm run build` | Aprovado |
| `npm run lint` | Aprovado |

MongoDB 8 em container isolado e porta local dinâmica. Testes criam um banco de nome único sessions_test_*, sem usar MONGO_URL da aplicação. O banco de teste é removido no encerramento. Não foi acessado nem apagado banco do usuário.

Testes de integração usam controllers, Passport, JWT, serviço de usuários e MongoDB reais num módulo focado em autenticação; não carregam e-mail ou todos os módulos comerciais/legados da aplicação.

### Cenários comprovados

- Dois dispositivos, refresh independente e logout imediato da sessão atual.
- Replay revoga só a família correspondente; outra sessão permanece ativa.
- Segredo errado com ID consumido não causa revogação arbitrária.
- Cinco rodadas de oito refreshes concorrentes: uma única atualização vencedora em cada rodada; histórico com um consumo e família revogada por replay.
- Expiração absoluta sem extensão; expiração verificada no serviço.
- Dono incorreto não acessa nem revoga a sessão.
- JWT legado/expirado e usuário excluído são rejeitados.
- Limite de rotações exige credencial atual válida para revogar.
- Índice único realmente criado e conflito rejeitado por MongoDB.
- Verificadores ocultos de seleção e serialização.
- Login inválido e refresh malformado não criam sessões.
- Papéis atuais do banco prevalecem sobre os do JWT.

## Reproduzir os testes no PowerShell

Com Docker Desktop iniciado, na pasta do repositório:

```powershell
$name = "animal-feed-sessions-test-" + [guid]::NewGuid().ToString("N")
$previousUri = $env:SESSIONS_TEST_MONGO_URL
try {
    docker run -d --rm --name $name -p "127.0.0.1::27017" mongo:8
    if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar MongoDB de teste" }
    $mapping = docker port $name 27017/tcp
    $port = ($mapping -split ':')[-1].Trim()
    $env:SESSIONS_TEST_MONGO_URL = "mongodb://127.0.0.1:$port"
    npm run test:sessions
    if ($LASTEXITCODE -ne 0) { throw "Testes de sessões falharam" }
} finally {
    docker stop $name
    $env:SESSIONS_TEST_MONGO_URL = $previousUri
}
```

Esse comando cria e remove somente seu container de teste dedicado. Sem SESSIONS_TEST_MONGO_URL, a suíte falha explicitamente, em vez de pular testes silenciosamente ou usar o banco da aplicação.

## Limitações e continuidade

- Integração é rastreada pelo PR e encerramento da issue. Não confundir merge com implantação em produção.
- PBAC, negar por padrão em todas as rotas e isolamento por organização são issues #3/#4.
- Listar/revogar sessões por interface ou administração é issue #5.
- Auditoria persistente completa e testes adicionais de segurança são issue #6. Tokens não devem ser registrados nos logs.
- Política de senha/recuperação e revogação por alteração de credenciais precisa de planejamento posterior.
- Não houve ensaio de produção, carga, falhas de rede ou failover de MongoDB. Testes não são auditoria completa de segurança.
- Armazenamento do token no frontend e segurança XSS/CSRF precisam de contrato próprio; não há frontend implementado aqui.

## Roteiro para estudar o código

1. Leia AuthSession: identifique dono, credencial atual, histórico e revogação.
2. Leia generateRefreshToken/parseRefreshToken: diferencie identificador público de segredo.
3. Leia rotate: veja as condições do filtro, a escrita única e a prova exigida para replay.
4. Leia AuthService e JwtStrategy: encontre onde cada login cria sessão e cada acesso verifica sid.
5. Leia o primeiro teste HTTP: observe celular/computador e logout de um sem derrubar o outro.
6. Leia o teste concorrente: compare resultado da chamada com estado final da família, pois o vencedor pode ser revogado por replay posterior.
