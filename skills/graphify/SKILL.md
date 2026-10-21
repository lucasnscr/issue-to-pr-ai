---
name: graphify
description: Usar um grafo local da base confiável para orientar dependências e impacto de mudanças no catálogo.
license: Apache-2.0
metadata:
  upstream: "https://github.com/Graphify-Labs/graphify"
  revision: "847a93f3cab5e2c82ea9170014b21cd2c52a4417"
  adaptation: "issue-to-pr-ai-v1"
---

# Graphify com contexto preparado

Adaptação do Graphify-Labs/graphify. O pipeline executa a CLI graphifyy fixada, somente AST de código da base confiável, com backend none. O resumo do grafo é fornecido como dados e identifica commit, cobertura, contagens e relações omitidas pelo limite.

Use caminhos e source_location para orientar leitura e hipóteses de impacto. Diferencie relação extraída de inferida. Um grafo parcial ou a ausência de uma aresta não prova que um método não existe ou não é chamado.

O grafo descreve a base, não comprova o comportamento do patch: aplique mentalmente o diff e confirme no código/testes fornecidos. No revisor, ele é contexto textual; ferramentas continuam negadas.

Não instale hooks, MCP, pacotes globais ou serviços; não consulte URLs nem execute código candidato. Modos semânticos, nuvem, mídia e exportação para bancos externos do upstream não fazem parte deste adaptador.
