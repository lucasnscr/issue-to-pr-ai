# Roteiro de apresentação, 15 minutos

## Slide 1

0:00–0:40

Esta é uma prova de conceito pessoal, com código público e dados fictícios. A proposta é discutir como agentes de código entram em um processo de engenharia com critérios verificáveis. Os casos para a B3 são sugestões para avaliação das equipes, sem representar adoção ou aprovação interna.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai

## Slide 2

0:40–1:30

O ganho de produtividade ainda é uma hipótese. Começamos com uma mudança que alguém consegue revisar e com critérios que a automação consegue verificar. Uma tarefa extensa, com regra ambígua ou sem ambiente executável, dificulta atribuir sucesso e custo ao agente. O catálogo serve como laboratório para esse recorte.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai

## Slide 3

1:30–2:40

No fluxo controlado, a geração não recebe o token de escrita que publica a PR. O modelo prepara os arquivos. O workflow avalia o escopo e executa testes antes de um job separado publicar o patch. Os comandos /oc e @claude usam CLIs não interativas e o mesmo publisher isolado. Essa garantia depende dos controles do workflow, não somente do prompt. O merge continua uma decisão humana, salvo uma autorização explícita para esta entrega.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39537190954

## Slide 4

2:40–3:30

Mostrar primeiro o comportamento observável da aplicação pelo Swagger ou por chamadas HTTP. A aplicação completa deste demo compreende API, PostgreSQL e infraestrutura, sem uma interface web própria. O diagnóstico histórico validou a API e o banco reais. A demonstração não usa qualquer conexão com dados ou sistemas da B3.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39540969370

## Slide 5

3:30–4:50

A primeira chamada autenticada ao modelo gerou uma implementação, mas seis testes de integração falharam. A pipeline bloqueou a publicação. A análise das falhas gerou instruções corrigidas para a segunda tentativa. A execução seguinte passou e originou a PR #3. Os 60 testes pertencem à CI dessa PR: 28 Java e 32 Node. Isso não mede qualidade universal e não demonstra correção autônoma. O registro histórico levou cerca de seis minutos para geração e validação.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39536145613
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39537190954
https://github.com/lucasnscr/issue-to-pr-ai/pull/3

## Slide 6

4:50–6:10

O portal público B3 for Developers disponibiliza documentação de APIs B2B. A partir desse contexto público, proponho discutir tarefas de engenharia que tenham escopo e aceite claros. Nenhuma linha desta tabela descreve um projeto interno existente. Para um primeiro piloto, usar repositório de laboratório e dados sintéticos. Precisão de domínio e decisão de entrega continuam com as pessoas responsáveis.

Fontes e evidências:
https://developers.b3.com.br/
https://github.com/lucasnscr/issue-to-pr-ai

## Slide 7

6:10–7:20

A faixa de preço é um exemplo da evolução atual. Mostrar a issue e seus critérios antes de mostrar o código. A comparação usa BigDecimal, os filtros precisam preservar o total e o contrato OpenAPI precisa documentar o comportamento. As regras são do catálogo de laboratório. O resultado da execução aparece no slide de evidências e só deve ser anunciado como concluído quando os links comprovarem o aceite.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://github.com/lucasnscr/issue-to-pr-ai/pull/17

## Slide 8

7:20–8:30

O projeto não exige que a ferramenta seja Claude Code. OpenCode foi a ferramenta do teste histórico, usando um modelo Anthropic. Cursor é outra ferramenta possível. A escolha depende de integração, acesso, operação e termos do provedor. Rodar uma CLI localmente ou em runner próprio não prova que a inferência acontece dentro da organização. O mesmo modelo pode não estar disponível em todos os produtos.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://cursor.com/docs/cli/headless
https://cursor.com/docs/cloud-agent

## Slide 9

8:30–9:50

A documentação atual do Cursor oferece modo headless e integração com GitHub Actions. O comando é agent, com -p para execução não interativa, e --force permite modificar arquivos. A adaptação proposta manteria a publicação fora do agente. Cloud Agents oferecem outro caminho, com ambientes próprios e integração GitHub/API. Neste repositório, não declaramos um teste autenticado do Cursor sem credencial e execução. Privacy Mode e controles do produto precisam de avaliação interna conforme o contrato e a configuração escolhidos.

Fontes e evidências:
https://cursor.com/docs/cli/headless
https://cursor.com/docs/cli/github-actions
https://cursor.com/docs/cloud-agent
https://cursor.com/docs/cloud-agent/api/endpoints
https://cursor.com/data-use
https://cursor.com/security

## Slide 10

9:50–11:00

Este slide descreve o desenho de um piloto. A main exige PR e checks, inclusive para o administrador. O laboratório tem um mantenedor e zero aprovações adicionais. O usuário autorizou explicitamente estes merges, executados pelo Codex. Isso não representa revisão técnica humana independente. O piloto corporativo precisa configurar responsáveis e aprovação independente. Timeout e número de etapas reduzem execução ilimitada, mas não equivalem a um teto monetário garantido por todos os provedores. Telemetria deve distinguir consumo informado, estimado e indisponível. Ferramentas e políticas de dados precisam de avaliação da organização antes de usar código interno.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://cursor.com/security

## Slide 11

11:00–13:20

Abrir a nova issue, a execução e a PR pelos links do arquivo evidence.json. Mostrar o Swagger e o teste HTTP correspondente. Se algum item continuar pendente, tratar como próximo passo e usar a execução histórica como demonstração de reserva. A API e o PostgreSQL passaram por implantação real em kind. vLLM e ARC permanecem sem execução real, pois o escopo deste laboratório não inclui GPU nem credenciais de GitHub App. O resultado do comando /oc no fluxo controlado é: /oc validado por comentário com publicação isolada. Claude Code: @claude validado por comentário, com 67 testes Java. Main: Código, fluxos e PRs #14 e #17 integrados à main. Governança: Política aplicada, tokens e custo estimado coletados.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://github.com/lucasnscr/issue-to-pr-ai/pull/17
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39540969370
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39540969370
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39542150017
https://github.com/lucasnscr/issue-to-pr-ai/pull/17
https://github.com/lucasnscr/issue-to-pr-ai/pull/17
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39540969370
https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39544001615
https://cursor.com/docs/cli/github-actions

## Slide 12

13:20–15:00

A proposta de uma equipe, duas semanas e dez issues é um desenho de piloto, não um resultado. Comparar tarefas equivalentes com e sem agente e registrar falhas, retrabalho, custo e esforço de revisão humana. O objetivo da conversa é escolher um caso pequeno e um responsável pelo piloto. O projeto ainda não fornece evidência para prometer uma porcentagem de ganho de produtividade. Reservar o último minuto para discussão.

Fontes e evidências:
https://github.com/lucasnscr/issue-to-pr-ai
https://developers.b3.com.br/
