---
name: superpowers-test-driven-development
description: Desenvolver um comportamento novo a partir de uma regressão que distingue erro e correção.
license: MIT
metadata:
  upstream: "https://github.com/obra/superpowers"
  revision: "2ce8aa15d05bd57213e6f746f953aafb7ded7a8b"
  adaptation: "issue-to-pr-ai-v1"
---

# Red → Green → Refactor

Comece pelo teste de um comportamento observável e pela entrada mínima que demonstra o erro. Quando comandos forem permitidos ao implementador, observe a falha antes de corrigir; se o teste falhar por infraestrutura, isso ainda não é o red do defeito.

Faça a mudança mínima e confirme a regressão e os testes relacionados. Refatore apenas depois, mantendo o contrato e sem aumentar o escopo. Não enfraqueça asserções para obter green.

No corretor, comandos continuam proibidos: escreva a regressão antes da mudança e deixe a execução para os jobs independentes. Não declare red/green observado por você nessa fase.
