# #06 — Auditoria e testes de segurança

## Objetivo
Garantir rastreabilidade e impedir regressões de autenticação/autorização.

## Escopo
- Eventos: login, falha, refresh, reutilização, logout, revogação e negação de política.
- Nunca registrar senha, JWT ou refresh token.
- Testes de concorrência, isolamento entre organizações, IDOR, refresh replay e revogação.

## Aceite
- Eventos sensíveis são consultáveis por auditoria.
- A suíte testa sucesso e negação de cada política relevante.
