# #02 — Sessões por dispositivo e rotação de refresh token

## Objetivo
Permitir sessões independentes em celular e computador, com revogação segura.

## Escopo
- Collection `auth_sessions`.
- Identificador público da sessão e verificador SHA-256 do segredo.
- IP, user-agent, criação, último uso, expiração, revogação e motivo.
- Rotação atômica; reutilização de token revoga a família de sessão.
- JWT vinculado à sessão ativa.

## Aceite
- Dois dispositivos funcionam simultaneamente.
- Refresh já usado não é aceito.
- Logout invalida a sessão imediatamente.
