---
name: superpowers-verification-before-completion
description: Relatar conclusão com evidências reais de testes, contratos e validações da execução atual.
license: MIT
metadata:
  upstream: "https://github.com/obra/superpowers"
  revision: "2ce8aa15d05bd57213e6f746f953aafb7ded7a8b"
  adaptation: "issue-to-pr-ai-v1"
---

# Evidências de conclusão

Para cada afirmação de sucesso, identifique a verificação e seu resultado observado. Diferencie teste unitário, PostgreSQL real, imagem Docker, aceitação HTTP e chamada real ao provedor.

Não transforme uma execução tecnicamente verde em aprovação da PR. Não trate falha ignorada, consumo desconhecido ou ausência de relatório como sucesso/zero.

Se a fase não permite comandos, reporte o que foi alterado e o que ainda será validado pelo pipeline. Não invente resultados nem afirme que uma skill foi eficaz apenas porque foi carregada.
