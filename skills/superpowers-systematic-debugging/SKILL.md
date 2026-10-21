---
name: superpowers-systematic-debugging
description: Investigar falhas reproduzíveis seguindo dados e hipóteses até uma causa demonstrada.
license: MIT
metadata:
  upstream: "https://github.com/obra/superpowers"
  revision: "2ce8aa15d05bd57213e6f746f953aafb7ded7a8b"
  adaptation: "issue-to-pr-ai-v1"
---

# Diagnóstico por causa

Parta da entrada, resultado observado e resultado esperado. Trace a informação pelas validações, normalizadores, serviço e consulta antes de escolher uma alteração.

Formule uma hipótese por causa e um teste que a diferencie de alternativas. Uma falha de ambiente não demonstra defeito do produto. Não acumule correções especulativas para ver se alguma funciona.

Se o parecer depende de contexto que não está disponível, registre a limitação. Na correção isolada, investigue lendo os arquivos fornecidos e escreva uma regressão; não execute comandos nem procure serviços externos.
