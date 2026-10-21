# Arquitetura e decisões

O [Issue to PR AI](https://github.com/lucasnscr/issue-to-pr-ai) demonstra a entrega de uma
issue até uma PR em draft com evidências dos testes. A API de catálogo oferece tarefas pequenas
para verificar o fluxo com modelos gerenciados ou inferência própria.

## Componentes

| Componente | Responsabilidade |
|---|---|
| GitHub Issues | Tarefa e critérios de aceite |
| GitHub Actions | Autorização, execução, timeout, testes e artefatos |
| OpenCode / Claude Code | Alteração controlada de código e testes, sem publicação |
| Publisher isolado | Aplica o patch validado, publica branch e draft PR |
| Modelo gerenciado / vLLM | Inferência consumida pelo agente |
| PostgreSQL e Flyway | Persistência e evolução de schema do catálogo |
| Maintainer | Revisão, aprovação e merge |

O agente executa no runner. O vLLM executa no cluster com GPU e oferece a API de inferência.
São processos separados: escolher inferência própria não exige mover a aplicação de catálogo
para o mesmo cluster. O catálogo também funciona somente com Docker Compose.

## Implementação por issue

O workflow escuta comentários novos. A primeira expressão do comentário deve ser `/oc`,
`/opencode` ou `@claude`; menções dentro de texto comum não ativam o agente.
O gate consulta a permissão atual do ator e o estado atual da issue na API do GitHub.
Ele exige `write`, `maintain` ou `admin`, label `ai:ready`, item aberto e ator humano.
Comentários de PR não iniciam implementação. A revisão possui um fluxo separado.

O runner inicia na branch padrão e registra o SHA exato. As CLIs executam sem credenciais GitHub
no ambiente e editam somente fonte, testes e documentação. O gate de escopo rejeita mudanças em
workflows, configuração, symlinks ou HEAD. Os validadores independentes são preservados antes da inferência.
Maven verifica a API com PostgreSQL real. Em seguida, Docker executa a aplicação empacotada e critérios HTTP.
Somente depois um runner novo, com token de escrita, aplica o patch e cria a draft PR.

`config/ai-policy.json` define modelos permitidos e limites de tempo, etapas, tokens e custo estimado.
A coleta encerra OpenCode ao observar excesso. Uma requisição em curso pode ultrapassar o valor:
o teto rígido de cobrança deve ser configurado no provedor/gateway. O job expira em 25 minutos.
A CI e a revisão são disparadas explicitamente pelo publisher. Não existe merge automático da IA.

Comentários são serializados por número da issue/PR. Novos comentários de bots não iniciam
implementações, e revisões não geram comentários de correção automaticamente.

## Primeira entrega e diagnóstico

A primeira implementação fica na branch `feat/initial-template` e é proposta por PR em draft
contra `main`. O bootstrap de um repositório vazio usa um commit vazio em `main` apenas para
estabelecer a base; o código entra pela PR. A revisão humana continua responsável pelo merge.

Antes desse merge, um push na branch `ai/live-test` inicia o workflow `AI live test`, quando
`AI_LIVE_TEST_ENABLED=true`. O teste implementa especificamente o filtro de categoria da issue
indicada em `AI_LIVE_TEST_ISSUE`, que deve estar aberta com a label `ai:ready`. O ator precisa
ter escrita no repositório. A variável `AI_LIVE_TEST_BASE_REF` aponta para `feat/initial-template`
na primeira entrega; o gate exige que essa base e a branch de diagnóstico tenham o mesmo commit.
A tarefa usa esse código e publica sua PR de resultado contra a base configurada.
Isso permite verificar uma chamada real e a entrega de código sem depender do workflow de
comentários, que só fica disponível quando estiver na branch padrão.

O job de geração executa `opencode run` com a credencial do modelo, sem token GitHub no ambiente
ou credenciais persistidas no checkout. O workflow restringe mudanças a código, testes e
documentação, executa testes com PostgreSQL real, faz build Docker e verifica o filtro por HTTP
antes de qualquer push do código gerado. Um job separado recebe o patch validado e a credencial
de escrita, publica a branch `ai/issue-<número>-<run>` e abre a PR em draft vinculada à issue.
O artefato `live-implementation`, os relatórios e a PR registram o que foi validado.
Esse diagnóstico é distinto do caminho nativo `opencode github run`; validar um deles não
comprova o outro. O [guia do GitHub](setup-cloud.md#teste-real-antes-do-primeiro-merge) descreve a execução.

## Revisão separada

O workflow de revisão usa as ferramentas da base da PR, sem checkout do head.
Ele baixa patches pela API e verifica se a PR ainda aponta para o SHA do evento.
A inferência recebe o patch como anexo e usa o agente `reviewer`, com todas as ferramentas negadas.
Essa etapa não recebe um token de escrita do GitHub pelo ambiente.

A publicação ocorre depois, em uma etapa com token. Um SHA obsoleto é descartado.
Reexecuções atualizam o comentário para o mesmo SHA, evitando comentários duplicados.
PRs de forks são ignoradas. Eventos automáticos ignoram drafts; um dispatch autorizado na branch
padrão permite revisar também uma draft. O publisher usa esse dispatch para a PR recém-gerada.
Marcar uma PR como pronta também dispara revisão.
Patches incompletos, binários ou acima de 32 mil bytes falham explicitamente e precisam de revisão humana.
Uma execução bem-sucedida indica que o comentário foi produzido, não que o código foi aprovado.

## Validação e evidências

`CI / Repository checks` valida scripts, sintaxe dos workflows, YAML, POMs e composição dos manifestos.
`CI / Build and tests` executa testes unitários, testes HTTP com PostgreSQL real e build Docker.
JaCoCo produz relatório de cobertura sem usar uma porcentagem arbitrária como critério de qualidade.

Execuções de IA salvam agente, modelo, duração, resultado e consumo em JSON e no resumo da Action.
Tokens e custo estimado vêm dos metadados da CLI. Campos ausentes permanecem indisponíveis;
o faturamento real não é inventado. A política bloqueia publicação sem telemetria válida.
Os registros são telemetria operacional, não prova de qualidade. Consulte [governança](governance.md).

## Limites da entrega

O perfil Kubernetes é um laboratório com uma instância de PostgreSQL e uma de inferência.
Backup, autenticação de usuários da API, TLS externo e HA ficam para uma implantação de produção.
O endpoint de inferência é ClusterIP com chave e NetworkPolicy de entrada; a aplicação usa port-forward
no laboratório. Nenhuma infraestrutura é provisionada automaticamente ao fazer push.
