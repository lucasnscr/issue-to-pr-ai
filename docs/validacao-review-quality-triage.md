# Validação de avaliação e triagem (R1/R2)

## R1: execução real do revisor

Em 21/10/2026, a [execução 39660244458](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39660244458)
avaliou os seis casos de `evals/reviewer/v1`, usando `anthropic/claude-sonnet-4-6`,
OpenCode 1.19.3 e o commit `c48caed5edd95dc66b3423f6347b4ff20b4e305f`.
O workflow terminou com sucesso e `evaluationValid=true`.

| Medida | Resultado |
|---|---|
| Verdadeiros positivos / falsos positivos / falsos negativos | 2 / 1 / 0 |
| Precisão / recall / F1 | 66,67% / 100% / 0,80 |
| Casos corretos sem achados indevidos | 3 de 4 (75%) |
| Respostas inválidas / divergências de prioridade | 0 / 0 |
| Consumo estimado reportado | USD 0,05966775 |

Os defeitos de truncamento por paginação e duplicatas gravadas por SQL foram identificados.
O caso correto `selected-expression-ordering` recebeu um falso positivo; os outros três
casos corretos ficaram sem achados. Não foram ajustados os rótulos para melhorar a pontuação.
O resultado coincide com as contagens do exemplo sintético, mas esta coleta é independente,
com chamadas reais e telemetria de cada caso no artefato `reviewer-evaluation-39660244458`.
O relatório registra hashes do dataset, prompt e políticas. Artefatos expiram após 14 dias.

Uma execução de seis casos não qualifica universalmente o modelo. O consumo é estimado,
não faturado. A avaliação verde comprova execução válida, não ausência de falsos positivos.
Esses resultados sustentam a necessidade da [triagem por commit](review-triage.md).

## R2: escopo da validação

Os testes automatizados verificam comandos, permissões, procedência, invalidação de decisões,
CI do commit, correções em execução, reconhecimento de paradas, preservação de reservas,
reconciliação de múltiplas PRs e proteção contra publicação de sucesso desatualizado.
A validação real no GitHub será registrada aqui após disponibilizar os workflows na `main`.
O teste anterior da [PR #32](validacao-engineering-loop.md) permanece histórico, com suas
duas tentativas e parada originais; ele não recebe decisões retroativas fabricadas.
