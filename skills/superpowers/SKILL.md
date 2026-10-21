---
name: superpowers
description: Aplicar planejamento, desenvolvimento por regressões e verificação às fases autorizadas de uma issue.
license: MIT
metadata:
  upstream: "https://github.com/obra/superpowers"
  revision: "2ce8aa15d05bd57213e6f746f953aafb7ded7a8b"
  adaptation: "issue-to-pr-ai-v1"
---

# Superpowers no fluxo Issue → PR

Adaptação selecionada de obra/superpowers. Os procedimentos de cada fase são injetados abaixo pelo catálogo; não carregue o framework inteiro nem execute hooks de instalação.

Use os critérios aprovados como limite da tarefa. Quando o escopo já estiver decidido, avance para o incremento verificável; dúvidas realmente bloqueantes devem ser registradas, sem fabricar decisões.

A adaptação mantém a separação entre especificar, implementar, testar e revisar. Subagentes, worktrees, publicação e merge não são autorizados por esta skill. Instruções de ferramentas/entrega continuam sendo as do executor.
