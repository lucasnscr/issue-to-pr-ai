# Verificação local

Verificado em 20 de outubro de 2026, com Java 21 e Docker Desktop:

| Verificação | Resultado |
|---|---|
| `./mvnw -B -ntp verify` | 2 testes unitários + 17 testes HTTP/PostgreSQL, todos aprovados |
| `node --test scripts/tests/*.test.cjs` | 32 testes de autorização, escopo, diagnóstico de erros e publicação de revisão, todos aprovados |
| `docker build -t catalog-api:0.1.0 .` | Build multi-stage aprovado; processo final usa UID/GID 10001 |
| Compose + `scripts/smoke.mjs` | Readiness, criação, consulta, exclusão e OpenAPI aprovados |
| actionlint 1.7.12 | Workflows válidos |
| `make check` | YAML, POMs, invariantes do agente, Compose e renderização Kustomize aprovados |
| OpenCode CLI 1.19.3 + `scripts/run-review.mjs` | Revisão gerada usando um endpoint local simulado compatível com a API vLLM |

Os testes HTTP usam PostgreSQL real em container, incluindo migration Flyway e rollback de atualização
com SKU duplicado. O teste do revisor confirmou instalação da CLI, leitura do anexo, configuração
do provider e extração do texto JSON; ele não mede qualidade de um modelo real.

## Evidências no GitHub

O código foi publicado na [PR #2](https://github.com/lucasnscr/issue-to-pr-ai/pull/2).
A [CI 39535591349](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39535591349)
aprovou 19 testes Java, os 27 testes Node existentes naquele commit, build Docker e smoke HTTP.

A primeira [execução real de IA](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39536145613)
usou OpenCode com `anthropic/claude-sonnet-4-6` e gerou a implementação da issue #1.
Os testes executaram 2 casos unitários e 26 de integração, detectando seis falhas; a publicação
foi bloqueada. Isso confirma execução real do modelo e da barreira de testes, sem aprovar a proposta gerada.
O diagnóstico foi reforçado para preservar o patch candidato e exigir a suíte completa do agente.

A [segunda execução real](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39537190954)
foi aprovada: 2 testes unitários e 26 testes de integração passaram, seguidos do build Docker,
smoke HTTP e critérios independentes de categoria, normalização, paginação, totais e entrada inválida.
Um runner separado publicou a [PR #3](https://github.com/lucasnscr/issue-to-pr-ai/pull/3) em draft,
com base na branch da PR #2. A revisão do diff não identificou falhas nos critérios solicitados.
O diagnóstico foi desativado após a execução; nenhuma PR foi aprovada ou mesclada automaticamente.

ARC, Kubernetes e inferência em GPU ainda não foram executados. Os manifestos foram renderizados,
sem aplicar mudanças em um cluster. Consulte [GitHub](setup-cloud.md) e [Kubernetes](setup-kubernetes.md).
