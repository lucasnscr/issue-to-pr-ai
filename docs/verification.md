# Verificação e evidências

A [validação da referência de método](validacao-reference-method.md) descreve a evolução
de organização, diagnóstico/bootstrap e especificação real. Abaixo ficam os snapshots
históricos, com seus próprios commits e execuções; seus números não são a suíte atual.

## Snapshot de 21/10/2026

A API, os workflows e os controles foram validados no laboratório com PostgreSQL, Docker e Kubernetes local, sem GPU.
A [PR #24](https://github.com/lucasnscr/issue-to-pr-ai/pull/24) integrou a interface web própria, servida na mesma origem.
A [PR #32](https://github.com/lucasnscr/issue-to-pr-ai/pull/32) integrou a listagem completa de categorias e validou o ciclo de revisão/correção.
A suíte atual tem **84 testes Java**: 2 unitários e 82 de integração, incluindo 5 casos de categorias e 12 de entrega de assets/HTTP do frontend.
Os testes do frontend não executam JavaScript.
O [roteiro de navegador](frontend.md) cobre as interações, foco dos diálogos, preço em 390 px e troca de filtros durante carregamento.

| Evidência | Resultado |
|---|---|
| [CI da `main` em `3a6d1baa91c2`](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39648755163) | 84 testes Java e 97 Node, configuração/lint, build Docker e aceitação HTTP aprovados |
| [Ciclo real de revisão/correção](validacao-engineering-loop.md) | Duas correções publicadas na PR #32, testes de regressão e HTTP independente; estado final `needs-human`, seguido de triagem assistida |
| [/oc por comentário](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39540969370) | Faixa de preço, 49 testes Java e aceitação Docker/HTTP antes da [PR #14](https://github.com/lucasnscr/issue-to-pr-ai/pull/14) |
| [@claude por comentário](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39542150017) | Ordenação, 67 testes Java e aceitação Docker/HTTP antes da [PR #17](https://github.com/lucasnscr/issue-to-pr-ai/pull/17) |
| Scripts de autorização, política, revisão, correção e publicação | 97 testes Node aprovados no commit atual de referência |
| [Kubernetes na CI](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39544001615) | 9 critérios com PostgreSQL/PVC, HTTP e persistência após substituir os Pods da API e do banco |
| Kubernetes local na aplicação com ordenação | 9 critérios e suites HTTP independentes de smoke, categoria, preço e ordenação aprovados no commit `3599e2a4baa681cd7afe58644b2bc5ae8b3dc063` |
| [Revisão real](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39542895407) | Inferência com ferramentas negadas e comentário associado ao SHA, sem aprovação automática |
| [Idempotência real](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39544635495) | Workflow aprovado, agente ignorado porque o mesmo SHA já tinha comentário. Nenhuma nova inferência iniciada |

As implementações por comentário acima registraram estimativas de USD 0.52553265 (OpenCode) e USD 0.743346 (Claude Code), com tokens e cache discriminados.
O laboratório posterior do ciclo somou USD 0.53927370 em quatro revisões e duas correções.
São estimativas do cliente, não faturas. Consumo ausente em falhas permanece indisponível.

No teste do ciclo, 26 produtos reproduziram o truncamento antes da primeira correção; o mesmo
banco retornou todas as categorias depois. Uma prova final usou 30 produtos, incluindo quatro
inseridos por SQL. Os dois testes de regressão do agente falharam ao restaurar suas versões
defeituosas e passaram com as correções. O estado `needs-human` foi preservado no acompanhamento;
a última revisão não foi uma liberação automática. Os resultados, SHAs e a triagem estão no
[relatório do laboratório](validacao-engineering-loop.md).

A revisão real mostrou hipóteses equivocadas sobre código fora do diff. O contexto foi ampliado com trechos da base confiável. A execução `39544449626` gerou/publicou a revisão e registrou uso, mas um evento concorrente cancelou o workflow após essas etapas. A configuração final serializa revisões sem cancelar uma inferência em andamento. As conclusões continuam consultivas, e os testes/inspeção da base são necessários para avaliar cada achado.

A aplicação com ordenação passou pelos filtros combinados, erros 400 e desempate por ID. O índice `(price, id)` não é prova de ausência de sort em `price DESC, id ASC`; não há benchmark de desempenho.

A proteção da main exige PR e checks, inclusive para administrador, e bloqueia force push/exclusão. O laboratório exige zero aprovações adicionais porque há um mantenedor. Estes merges foram autorizados explicitamente pelo usuário e executados pelo Codex, sem alegar revisão técnica humana independente.

Cursor está documentado como alternativa e não foi autenticado. vLLM, ARC e enforcement de NetworkPolicy exigem ambiente próprio e permanecem sem teste real. Integrações internas de IAM/SIEM/faturamento dependem das equipes responsáveis. Veja [governança](governance.md), [Kubernetes](kubernetes-verification.md) e [Cursor](cursor.md).
Para adotar o processo, consulte o [modelo de trabalho](modelo-de-trabalho.md) e o
[runbook de adoção](runbooks/adoption.md). O [roadmap](roadmap.md) distingue bootstrap,
check de liberação e demais componentes implementados das próximas propostas.

# Snapshot histórico de 20/10/2026

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

Nesse snapshot, Kubernetes/ARC/GPU tinham apenas renderização. A execução real de Kubernetes foi acrescentada em 21/10, conforme o registro atual acima. vLLM e ARC continuam sem execução real.
