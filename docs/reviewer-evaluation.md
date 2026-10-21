# Avaliação reproduzível do revisor

O avaliador mede achados confirmados, falsos positivos e defeitos não detectados em um
dataset versionado. Ele usa o mesmo construtor de prompt, parser e executor do revisor
de produção. O dataset atual contém seis casos sintéticos derivados do laboratório:
truncamento em 20 produtos, variantes gravadas por SQL, normalização existente,
ordenação JPQL, descrição opcional e limpeza de testes fora do diff.

Os rótulos ficam em `evals/reviewer/v1`; não são enviados ao modelo. Cada caso contém
patch, contexto confiável e rótulos com localização, grupos de evidência e prioridades
esperadas. Os grupos de evidência aceitam termos alternativos; a localização sozinha
não confirma um defeito. Um matching individual impede contar um mesmo achado duas vezes.
Esse critério é uma heurística auditável, não uma avaliação semântica completa. Alterar
rótulos exige revisão do mantenedor e uma nova versão quando muda o contrato do dataset.

## Execução offline

```sh
node scripts/evaluate-reviews.mjs \
  --responses evals/reviewer/v1/example-responses.json \
  --output artifacts/reviewer-evaluation.json
```

O exemplo é **sintético**: inclui deliberadamente dois acertos e um falso positivo.
Não é um resultado do provedor. O modo offline não chama modelo nem precisa de secret.
Forneça respostas no formato versionado do exemplo para comparar outras execuções.
Respostas desconhecidas/duplicadas falham; ausências e JSON inválido tornam a avaliação
inválida. Um caso de bug ausente também conta como defeito não detectado.

## Execução real no GitHub

Depois que o workflow estiver na branch padrão, um colaborador com escrita pode executar:

```sh
gh workflow run ai-review-evaluation.yml --ref main
```

O workflow exige `AI_ENABLED=true`, `AI_REVIEW_ENABLED=true`, modelo permitido em
`REVIEW_MODEL` e o secret do provedor já configurado. Não executa automaticamente a
cada PR. O revisor mantém ferramentas negadas; o subprocesso não recebe token de escrita
do GitHub. O modelo recebe apenas dados sintéticos do checkout confiável.

`config/review-evaluation.json` limita a execução a seis casos e uma estimativa observada
de USD 2. Antes de outra chamada, reserva a margem máxima de uma revisão. Uma falha ou
telemetria desconhecida interrompe novas chamadas e preserva um relatório parcial. Isso
é um controle observado, não um teto de faturamento do provedor. O perfil de cada revisão
continua limitado por `config/ai-policy.json`.

## Ler os resultados

O artefato `reviewer-evaluation-RUN_ID` contém `report.json` e resultados/uso por caso,
com retenção de 14 dias. O relatório identifica modalidade, modelo, commit, hashes do
dataset, prompt e políticas, versão da CLI e estimativas de consumo.

| Campo | Interpretação |
|---|---|
| `evaluationValid` | Todas as respostas necessárias existem e respeitam o formato/localização |
| `truePositives` / `falsePositives` / `falseNegatives` | Achados correspondentes, extras e defeitos esperados não detectados |
| `precision` / `recall` / `f1` | Métricas agregadas; denominador vazio permanece `null` |
| `cleanCasePassRate` | Proporção de patches corretos que receberam zero achados |
| `severityMismatches` | Defeitos encontrados com prioridade fora do rótulo esperado |
| `usage.estimatedCostUsd` | Estimativa total disponível das chamadas; `null` se há consumo desconhecido |
| `usage.knownEstimatedCostUsd` | Parcela de consumo que foi efetivamente reportada |

Uma execução tecnicamente verde significa que a avaliação foi realizada; não significa
que o modelo atingiu uma meta de qualidade. O projeto ainda não usa um limiar desse
benchmark para liberar mudanças de produção. Compare resultados completos por versão,
inspecione cada caso e repita a coleta para observar variabilidade antes de escolher
modelo/prompt. Um conjunto de seis casos não mede qualidade universal do revisor.

O [roadmap](roadmap.md) registra R1; a [triagem operacional](modelo-de-trabalho.md) continua
necessária para achados de PRs reais.
