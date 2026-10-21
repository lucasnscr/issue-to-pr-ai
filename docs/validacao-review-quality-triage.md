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

## R2: bloqueio real de regressão

Os testes automatizados verificam comandos, permissões, procedência, invalidação de decisões,
CI do commit, correções em execução, reconhecimento de paradas, preservação de reservas,
reconciliação de múltiplas PRs e proteção contra publicação de sucesso desatualizado.
Depois de integrar a [PR #42](https://github.com/lucasnscr/issue-to-pr-ai/pull/42), a
[PR de laboratório #43](https://github.com/lucasnscr/issue-to-pr-ai/pull/43) recebeu uma
regressão deliberada, isolada na branch: truncar categorias em 20 resultados. A aplicação
na `main` permaneceu correta. O ensaio não autorizou `ai:autofix` nem chamou o corretor.

No SHA `d01bd1aef5bc20ae853765c7338d371760f917be`:

- O check publicou `action_required` enquanto aguardava revisão confiável do commit.
- A [CI 39662969821](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39662969821)
  reprovou `returnsAllCategoriesWhenCatalogExceedsDefaultPageSize`: esperado 21, recebido 20.
- A [revisão real 39663011895](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39663011895)
  identificou o truncamento em `ProductService.java:71`, achado `f-d9d55f6867c636f3` (P1),
  por USD 0,0214365 estimados.
- O [comentário autorizado de confirmação](https://github.com/lucasnscr/issue-to-pr-ai/pull/43#issuecomment-6324844260)
  vinculou SHA, revisão, achado e evidência do teste. A decisão não substitui a CI reprovada:
  `AI review gate` publicou `failure`, e a PR permaneceu bloqueada.
- O [recibo do bot](https://github.com/lucasnscr/issue-to-pr-ai/pull/43#issuecomment-6324851246)
  registrou ator `lucasnscr`, hash/ID da origem e decisão `confirm`. O
  [reconciliador 39663246959](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39663246959)
  terminou com sucesso técnico ao manter o bloqueio: workflow verde não equivale a entrega liberada.

O limite foi removido na mesma branch, restaurando integralmente o serviço. A versão de
entrega desta PR altera somente este relatório; a regressão não deve constar do diff final.
Cada novo commit exige novamente revisão e CI do SHA atual antes da decisão de integração.

O check `AI review gate` foi adicionado às verificações obrigatórias de `main`, vinculado
ao GitHub Actions (App 15368), preservando `Repository checks`, `Build and tests`, modo
estrito e as demais regras existentes. Isso foi aplicado pela API e conferido; não é apenas
uma alteração no JSON do perfil. O gate não aprova nem faz merge de PRs.

O teste anterior da [PR #32](validacao-engineering-loop.md) permanece histórico, com suas
duas tentativas e parada originais; ele não recebe decisões retroativas fabricadas.
