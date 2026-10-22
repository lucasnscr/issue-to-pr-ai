# Validação da referência de método de trabalho

Evolução vinculada à [issue #47](https://github.com/lucasnscr/issue-to-pr-ai/issues/47).
O [índice](README.md), [quickstart](quickstart.md), [decisões](decisions/README.md) e
[runbooks](runbooks/adoption.md) organizam a entrada, execução, manutenção e adoção.
Este relatório distingue configuração, testes com respostas simuladas e execução real.

## Mudanças verificáveis

- README orientado ao método e documentação da aplicação em `apps/catalog-api/README.md`.
- Formulários de funcionalidade/defeito/manutenção, PR template e CODEOWNERS.
- Catálogo versionado de labels/metadados; bootstrap com prévia e aplicação explícita.
- Doctor local/GitHub por perfil, sem valores de secrets ou mudanças no repositório.
- CI verifica estrutura, catálogo, links/âncoras, configuração e testes.
- Exemplos históricos exigem confirmação explícita para criação, evitando trabalho já concluído.

Bootstrap e doctor possuem testes de ausência de efeitos na prévia, destino explícito,
preservação de labels/topics alheios, repetição idempotente e falha antes de mutações quando
há metadados incompletos/limites. O doctor rejeita proteção enfraquecida ou não verificável,
ativação ausente e modelo/credencial incompatíveis. Suas mensagens não copiam dados de erro
ou valores de variáveis potencialmente sensíveis. A validação de docs verifica targets e
âncoras Unicode/repetidas, ignora exemplos em fences e não consulta URLs externas.

## Especificação real com skills e Graphify

Foi criada a [issue de laboratório #48](https://github.com/lucasnscr/issue-to-pr-ai/issues/48)
com uma solicitação ilustrativa de pesquisa por SKU e decisões explicitamente pendentes.
O teste autorizava somente especificação. `AI_SPEC_ENABLED=true` foi configurado para essa
validação; o bootstrap continua sem ativar IA em cópias do método.

A [execução 39758849804](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39758849804)
concluiu no commit confiável `cd5d5d0de2b2c009c4689c688e847fe1b62518aa` e publicou
[o comentário do bot](https://github.com/lucasnscr/issue-to-pr-ai/issues/48#issuecomment-6337918680).

| Item | Resultado observado |
|---|---|
| Modelo | `anthropic/claude-sonnet-4-6`, via OpenCode fixado |
| Resposta estruturada | `needs-input`, 5 perguntas e 10 critérios propostos condicionais |
| Publicação | Comentário separado; nenhuma implementação, PR ou autorização `ai:ready` |
| Uso | Completo, 1 etapa, 40 segundos de execução da inferência |
| Tokens reportados | 3 entrada, 1.830 saída, 4.625 escrita de cache; total/unidades de política 6.458 |
| Estimativa do cliente | USD 0.04480275; faturamento do provedor indisponível |
| Skills selecionadas | `graphify`, `postgres-flyway`, `superpowers` |
| Skills usadas na fase | `graphify`, `grill-me`, `superpowers`, `superpowers-writing-plans` |
| Graphify real | 75 arquivos, 681 nós, 1.536 relações, modo `code-only`/backend `none` |
| Contexto do grafo | 23 relações, 3.946 bytes; 1.513 omissões registradas |

`postgres-flyway` permaneceu na seleção, mas não foi carregada na especificação porque
essa fase não está no seu catálogo. Isso confirma o filtro por fase. O hash do catálogo
foi `4a83d1170ff68be5a9cdfb48ccb63130528ef64d201b4b5f461db3128862318f`.
Os artefatos contêm manifesto, uso, proposta e grafo; valores de credenciais não foram
baixados ou publicados. Artefatos brutos de execução não são versionados.

A resposta é uma proposta, não comprovação de decisões ou de correção técnica. Por exemplo,
normalização/índices e exemplos de rotas sugeridos ainda precisam ser confrontados com o
contrato e código existentes. O teste comprova integração, limites e publicação consultiva,
sem demonstrar que todas as recomendações do modelo são corretas.

A reexecução da mesma execução, tentativa 2, concluiu com preparação aprovada e inferência,
instalação da CLI e publicação ignoradas: o comentário original foi reconhecido. O corpo
da issue permaneceu igual e as labels ficaram vazias. A issue foi encerrada após o laboratório.

## Revisão real com skills e idempotência

A [PR temporária #50](https://github.com/lucasnscr/issue-to-pr-ai/pull/50) continha somente
uma nota Markdown sintética na branch de teste. Ela vinculou a issue #48 para herdar a
seleção. A [execução 39761728787](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39761728787)
usou ferramentas negadas e o checkout confiável da `main` para revisar o commit
`31e7452b6bbdb83d1ca08725ed68b75f6cb3115b`.

O [parecer publicado](https://github.com/lucasnscr/issue-to-pr-ai/pull/50#issuecomment-6338323562)
teve zero achados, uso completo, 1 etapa e duração de inferência de 7 segundos. O modelo
foi Sonnet 4.6 via OpenCode, com estimativa USD 0.01827150 e 4.522 tokens reportados
(3 entrada, 117 saída, 4.402 escrita de cache). O manifesto registrou `code-review`,
`graphify`, `postgres-flyway` e `superpowers`; a skill de persistência, ausente na fase de
especificação, foi corretamente incluída na revisão. Graphify continuou sem backend LLM.

Uma [nova solicitação para o mesmo SHA](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39762065559)
concluiu com geração/publicação ignoradas, reaproveitando o parecer existente. CI e gate
da PR de laboratório passaram. Ela foi fechada, sem merge e sem `ai:autofix`; a nota de
teste não foi integrada à aplicação. Os dois testes reais de modelo somaram estimativa
de USD 0.06307425, sem equivaler a fatura nem incluir custos de runners/infraestrutura.

Esse teste comprova a integração da revisão com skills e sua idempotência, não uma revisão
de toda a PR de organização. O patch completo dessa PR tinha 124.200 bytes no formato do
revisor na primeira publicação, acima do limite de 96.000. A PR principal segue inspeção
do diff e validações pelo mantenedor/Codex, com o caminho manual do gate, sem aumentar
limites nem truncar conteúdo para obter um parecer.

## Validação da entrega

Antes da publicação, a validação local concluiu:

| Verificação | Resultado |
|---|---|
| `make check` | 166 testes Node; catálogo, links, doctor offline, configuração, Compose e Kustomize aprovados |
| `./mvnw -B -ntp verify` | 84 Java: 2 unitários e 82 de integração PostgreSQL real; sem ignorados |
| Documentação | 61 arquivos Markdown, 290 links/âncoras locais verificados; nenhum erro |
| Configuração | 28 arquivos YAML, POMs e invariantes aprovados |
| Actionlint | Workflows sem erros em `rhysd/actionlint:1.7.12` |
| Doctor de ferramentas | Node, Java 21, Python e daemon Docker aprovados |
| Bootstrap | Prévia validada sem consulta/mutação; aplicação real fica separada da prévia |
| Doctor GitHub antes do bootstrap | Perfis ativos e controles verificáveis; avisos de template, descrição e labels ainda não aplicados |

Depois da prévia e dos testes, o bootstrap foi aplicado à origem com `--apply` explícito.
O GitHub confirmou `is_template=true`, descrição e homepage do método, 8 topics e as 12
labels gerenciadas. Labels/topics não gerenciados foram preservados. Não houve escrita
em secrets, flags de IA ou proteção pelo bootstrap; a ativação de especificação foi uma
operação separada para o teste real registrado acima.

O doctor GitHub no perfil `all` aprovou os 26 itens inspecionados, com `ready=true` e
`executionVerified=false`, preservando a distinção entre configuração e teste. A proteção
permaneceu com os três checks obrigatórios, branch atualizada e aplicação ao administrador,
sem force push/exclusão. A PR de laboratório foi encerrada e sua branch temporária removida;
seu commit e evidências continuam vinculados na PR fechada.

No commit `eed05f01ec2e86fa33db0d588acf90d57aa2d1ff`, a
[CI 39761484675](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39761484675)
aprovou os checks do repositório, Graphify real, os 84 testes Java, imagem Docker e HTTP.
A [execução Kubernetes 39761480341](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39761480341)
aprovou nove critérios em kind/Kubernetes v1.34.0, em 173 segundos. Verificou API/PostgreSQL
prontos, health/OpenAPI, CRUD, preços, conflitos/validação, filtros/paginação e persistência
após recriar Pods de API e banco; as fixtures e o cluster efêmero foram removidos.

Um ajuste adicional restringiu a API do bootstrap a `apply === true`, com teste que impede
um valor textual de realizar mutações. A CI do último SHA da PR continua sendo a condição
para integração; os resultados anteriores não substituem seus checks obrigatórios.
A referência anterior tem
[CI aprovada em cd5d5d0](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39711239332)
e [relatório do catálogo](validacao-skills.md). Esses resultados anteriores não substituem
a validação do novo commit.

## Alcance e limites

O caminho observado de especificação agora tem uma chamada real ao provedor. O ciclo
de duas correções e a revisão/triagem reais possuem [evidências históricas próprias](validacao-engineering-loop.md).
Esta evolução não deve ser apresentada como uma nova entrega completa de funcionalidade
por issue → implementação → correção apenas por ter chamado `/ai-spec`.

Kubernetes CPU é o perfil escolhido para a aplicação. GPU/vLLM, ARC, execução autenticada
do Cursor, quotas/faturamento compartilhados e integrações corporativas continuam sem
validação própria. Uma nova cópia do template também precisa ser validada; nenhum segundo
repositório foi criado nesta tarefa. “100%” não é garantia para cenários não executados.
