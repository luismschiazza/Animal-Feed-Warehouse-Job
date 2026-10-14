# #04 — ABAC e isolamento de dados

## Objetivo
Decidir acesso por atributos do usuário, recurso e ambiente.

## Atributos iniciais
- Usuário: organização, roles, status e vínculo.
- Recurso: organização, proprietário, criador e estado.
- Ambiente: sessão, dispositivo, horário e IP quando aplicável.

## Aceite
- Não há acesso horizontal por alteração de ID.
- Recursos são filtrados e validados pela organização no serviço, não só no controller.
- Proprietário só altera o que a política permitir.
