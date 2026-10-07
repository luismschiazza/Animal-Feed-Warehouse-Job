# #03 — Infraestrutura PBAC

## Objetivo
Centralizar decisões de autorização em políticas, sem regras espalhadas em controllers.

## Escopo
- Ação, recurso, sujeito e contexto tipados.
- Decorator de política e guard global/aplicável por rota.
- Negação por padrão.
- Resposta 401 para não autenticado e 403 para não autorizado.

## Aceite
- Política é avaliada no servidor em toda rota protegida.
- Não existe permissão implícita.
- Testes positivos e negativos por política.
