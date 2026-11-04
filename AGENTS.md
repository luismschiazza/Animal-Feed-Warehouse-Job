# Instruções do projeto Animal Feed Warehouse

Respeitar também as diretrizes permanentes de `D:/programacao/AGENTS.md`: trabalho em D:, preservação de dados/histórico/evidências, temporários somente em processos filhos e limpeza apenas de recursos comprovadamente próprios e descartáveis. Nunca reexecutar finalizadores de evidências seladas.

## Segurança, sessões e dependências — padrão permanente do proprietário

Antes de implementar ou escolher a proposta final:

1. Examinar o fluxo atual, as invariantes, o estado Git/GitHub e a autorização vigente.
2. Consultar primeiro fontes oficiais e boas práticas aplicáveis (por exemplo RFC/IETF, OWASP, documentação do fornecedor e advisories oficiais). Registrar URLs, data de consulta e quais recomendações realmente se aplicam; não alegar conformidade com um padrão apenas por reutilizar uma técnica.
3. Comparar alternativas, explicar problema/desenho ao proprietário e documentar a escolha antes do código. Justificar proteção de credenciais, autorização, prazos, concorrência, replay, auditoria, efeitos de falhas/commit incerto e expiração quando pertinentes.
4. Criar testes verificáveis, inclusive negativos e de concorrência/falhas relevantes; guardar comandos, saídas reais, tentativas que falharam e identidade exata de código/CI em nova evidência. Não enfraquecer assertions, failpoints, limites, timeouts, validações ou gates para obter verde.
5. Documentar resultados, fontes, riscos residuais, comportamento do cliente/operação e o que não foi certificado. CI verde não equivale a auditoria limpa, aceite na main ou prontidão de produção.

Autorização de pesquisa/implementação/testes/publicação **não** autoriza merge, deploy, encerramento de issue, renovação de exceção de segurança ou início de outra entrega. Essas ações exigem autorização específica.
