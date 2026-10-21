# Configurar o GitHub e os modelos gerenciados

## Publicar o template

O destino deste projeto é [lucasnscr/issue-to-pr-ai](https://github.com/lucasnscr/issue-to-pr-ai).
A implementação inicial é entregue por uma PR em draft da branch `feat/initial-template`
para `main`, vinculada à issue de implementação com `Closes #N`.

Um repositório vazio precisa de um commit de base antes de aceitar uma PR. Na primeira entrega,
o bootstrap autorizado cria somente um commit vazio em `main`, sem código da aplicação.
Toda a implementação fica em `feat/initial-template`. Depois desse bootstrap, mudanças seguem
sempre por branches dedicadas e PRs; não faça push direto em `main` nem force push.

Com a base e o remoto já configurados, o fluxo da implementação é:

```sh
git switch -c feat/initial-template
git add .
git commit -m "Add issue-to-pr AI development template"
git push -u origin feat/initial-template
gh pr create --repo lucasnscr/issue-to-pr-ai --base main \
  --head feat/initial-template --draft --title "Add issue-to-pr AI development template" \
  --body-file /caminho/para/descricao-da-pr.md
```

Inclua na descrição da PR o vínculo `Closes #N`, o comportamento entregue, os testes executados
e qualquer critério de aceite ainda não verificado. Uma pessoa revisa e decide o merge.

Em **Settings → Actions → General**, habilite Actions e a opção que permite a GitHub Actions
criar pull requests. A política da organização também precisa permitir as permissões solicitadas
pelos workflows. A CI não precisa de chave de modelo.

## Credenciais e variáveis

Em **Settings → Secrets and variables → Actions**, configure:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `ANTHROPIC_API_KEY` | Sua credencial Anthropic para os modelos gerenciados |
| Variable | `AI_ENABLED` | `true` para permitir implementações |
| Variable | `OPENCODE_MODEL` | Opcional; padrão `anthropic/claude-sonnet-4-6` |
| Variable | `AI_REVIEW_ENABLED` | `true` para habilitar revisão automática de PRs prontas |
| Variable | `REVIEW_MODEL` | Opcional; padrão `anthropic/claude-sonnet-4-6` |
| Variable | `CLAUDE_ENABLED` | `true` para habilitar também o comando `@claude` |
| Variable | `CLAUDE_MODEL` | Opcional; padrão `claude-sonnet-4-6` |
| Secret | `AI_GITHUB_TOKEN` | Opcional; token de GitHub App ou PAT limitado ao repositório |

Confirme que os IDs escolhidos estão disponíveis na sua conta do provedor.
Use a interface de secrets ou `gh secret set ANTHROPIC_API_KEY` em modo interativo.
Não coloque chaves em arquivos versionados ou comentários.

O template passa `GITHUB_TOKEN` diretamente à integração nativa do OpenCode (`USE_GITHUB_TOKEN=true`)
e à Action do Claude (`github_token`). Por isso, a instalação dos GitHub Apps dos fornecedores
é opcional neste perfil. O CLI OpenCode está fixado em `1.19.3`; Actions estão fixadas por SHA.

Por padrão, a escrita usa o token temporário da Action. PRs criadas/atualizadas por esse token
podem exigir **Approve workflows to run** antes da CI. Para disparar eventos sem essa etapa,
configure `AI_GITHUB_TOKEN` com um token de instalação de GitHub App ou PAT apropriado.
Confira o comportamento na [documentação de gatilhos do GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
Um token de instalação precisa ser renovado antes de expirar; o template não gera nem renova esse secret.
Se usar PAT, conceda somente Contents, Issues e Pull requests com escrita e Metadata com leitura;
não habilite bypass da proteção de branches.

## Teste real antes do primeiro merge

O workflow `AI live test` (`.github/workflows/ai-live-test.yml`) testa especificamente a
implementação do [filtro de categoria](demo-issues/01-category-filter.md), enquanto os arquivos
ainda estão na PR inicial. Ele é acionado por um **push na branch `ai/live-test`**, criada a partir do commit
de `feat/initial-template` que será validado. O destino da PR de demonstração é
`feat/initial-template`, que já contém a aplicação; `main` ainda contém apenas a base vazia.

Configure o secret `ANTHROPIC_API_KEY` no repositório pela interface do GitHub ou pelo comando
interativo abaixo. O valor é informado diretamente ao GitHub, sem ser versionado:

```sh
gh secret set ANTHROPIC_API_KEY --repo lucasnscr/issue-to-pr-ai
```

Crie uma issue aberta com os critérios do filtro de categoria e adicione a label `ai:ready`.
Configure também as variáveis de Actions abaixo antes de fazer push:

| Nome | Valor |
|---|---|
| `AI_LIVE_TEST_ENABLED` | `true` para autorizar este diagnóstico |
| `AI_LIVE_TEST_ISSUE` | Número da issue aberta do filtro de categoria |
| `AI_LIVE_TEST_BASE_REF` | `feat/initial-template` na primeira entrega |
| `OPENCODE_MODEL` | Opcional; padrão `anthropic/claude-sonnet-4-6` |

Esse workflow usa sua própria variável de ativação; `AI_ENABLED` controla o fluxo por comentários.
O gate exige um ator com escrita no repositório, a issue aberta com `ai:ready` e igualdade exata
entre o commit de `ai/live-test` e o commit atual de `AI_LIVE_TEST_BASE_REF`.

Depois de revisar o workflow e a issue, faça push da branch de diagnóstico:

```sh
git switch -c ai/live-test feat/initial-template
git push -u origin ai/live-test
```

Cada novo push nessa branch pode iniciar outra execução com consumo do provedor. Não configure
correções ou revisões em ciclo. O diagnóstico é separado dos comentários `/oc` e não depende
de o workflow `issue_comment` já estar em `main`.

A execução usa `opencode run` para uma tarefa delimitada. O job de inferência recebe a chave do
modelo, sem token GitHub no ambiente e sem credenciais persistidas pelo checkout. Após a geração,
o workflow valida o escopo e executa `./mvnw -B -ntp verify` com PostgreSQL real em Testcontainers.
Em seguida, faz build Docker e valida o filtro por HTTP com critérios independentes de
normalização, paginação, totais, resultado vazio e entrada inválida. Somente um resultado
aprovado segue para o job separado de publicação, que recebe a credencial de escrita, envia a
branch `ai/issue-<número>-<run>` e cria a PR em draft com base em `AI_LIVE_TEST_BASE_REF`
e vínculo à issue. O artefato `live-implementation` contém o resumo e relatórios dos testes.
`candidate.patch` preserva a proposta mesmo quando os testes falham; ele não autoriza publicação.
Somente `implementation.patch`, produzido após todas as validações, é usado pelo job de publicação.

Confira os logs, relatórios de teste, diff e PR resultante. A confirmação do teste real exige
uma resposta do modelo e a execução completa desse fluxo; checks locais e a presença do YAML
não comprovam a inferência. Esta documentação descreve como executar o teste, sem afirmar que
uma chamada real já foi concluída. Após o primeiro merge, use o fluxo por comentário abaixo
para validar a integração nativa de issues.

## Executar uma tarefa

Crie a label e uma issue pelo template. A label é aplicada por um maintainer após revisar o escopo:

```sh
gh label create 'ai:ready' --repo lucasnscr/issue-to-pr-ai \
  --color '0e8a16' --description 'Tarefa autorizada para implementação por IA'
```

Em uma issue aberta, adicione `ai:ready` e comente:

```text
/oc implemente esta issue e entregue uma PR em draft com testes
```

Ou, com Claude ativado:

```text
@claude implemente esta issue e entregue uma PR em draft com testes
```

Após a execução, confira os artefatos JSON e os resultados de teste. Verifique os critérios de aceite
e marque a PR como pronta; isso dispara `AI review` quando a revisão está habilitada.
O comentário da revisão é consultivo. Findings não iniciam correções automaticamente.
Para pedir uma correção, coloque `ai:ready` na PR e faça um novo comentário autorizado.

## Proteger a branch principal

Crie uma ruleset para `main`: exigir PR, pelo menos uma aprovação humana, resolução de conversas
e os checks `Repository checks` e `Build and tests`. Os checks aparecem após a primeira execução da CI.
Remova bypass de tokens e bots. Não use a revisão por IA como aprovação obrigatória de código.

## Diagnóstico

- Workflow ignorado: confira variáveis com valor literal `true`, permissão de escrita, label e comando no início.
- PR não criada: confira a opção **Allow GitHub Actions to create and approve pull requests** e as permissões da organização.
- Modelo recusado: confira secret, saldo/acesso da conta e ID do modelo; não inclua credenciais em logs.
- CI pendente após PR do bot: aprove a execução no GitHub ou use um token apropriado em `AI_GITHUB_TOKEN`.
- Testcontainers falha em runner próprio: disponibilize Docker e socket de daemon; o exemplo ARC usa DinD.

Consulte [OpenCode no GitHub](https://opencode.ai/docs/github/),
[Claude Code Action](https://github.com/anthropics/claude-code-action) e o
[roteiro de demonstração](demo.md).
