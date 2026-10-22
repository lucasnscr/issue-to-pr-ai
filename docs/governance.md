# Governança de execução e consumo

Esta é uma implementação de referência para laboratório. Não representa uma
arquitetura aprovada por uma organização nem uma integração com controles corporativos.

## Política versionada

`config/ai-policy.json` define a lista explícita de provedores/modelos e os limites
por perfil. `implementation` permite 35 etapas, 15 minutos, estimativa de USD 5 e
1,5 milhão de unidades conservadoras de tokens. `review` permite uma etapa, nove
minutos, estimativa de USD 1 e 80 mil unidades. Os valores são parâmetros do
laboratório, não uma recomendação de orçamento corporativo. O perfil `correction` permite
20 etapas, dez minutos, estimativa de USD 3 e 750 mil unidades, dentro do ciclo opcional descrito abaixo.

O perfil `specification` usa os limites de `review` em cada comando `/ai-spec`, em uma
execução separada. Rodadas repetidas geram consumo adicional e não entram na reserva de
USD 9 da PR. O subprocesso recebe somente a credencial do provedor e variáveis permitidas;
propostas sem telemetria completa são bloqueadas. Perguntas não concedem autorização para implementar.
O [catálogo](skills-catalog.md) registra seleção, hashes, fontes e licenças por fase.
Skills mantêm as permissões do revisor/corretor. Graphify usa parsing AST sem backend LLM,
sem receber credenciais, e deixa hashes/contagens do grafo; isso não elimina o custo do runner.

O fluxo controlado de implementação (`/oc` e `@claude`) executa
`scripts/run-implementation.mjs`, selecionando o CLI com `IMPLEMENTATION_AGENT`.
O caminho OpenCode, `scripts/run-review.mjs`, `scripts/run-specification.mjs` e `scripts/run-correction.mjs` usam
`scripts/run-governed-opencode.mjs`. O wrapper valida o modelo antes de iniciar o
processo, acompanha eventos JSON, encerra o grupo de processos ao exceder o tempo
ou um limite observado e bloqueia uma conclusão sem telemetria completa. Não há
publicação de código ou comentário após essa falha.

Na implementação inicial, o número de etapas também é limitado em `opencode.json`. A política observa
`step_start` e `step_finish` e bloqueia quando o limite é ultrapassado. Ao alterar
limites, mantenha o arquivo do agente e os timeouts dos jobs compatíveis.

O revisor é uma exceção de compatibilidade: OpenCode 1.19.3 adiciona uma mensagem
`assistant` ao atingir `agent.steps`. Claude 4.6 rejeita esse prefill. Por isso o
agente revisor não define `steps` na CLI, mantém todas as ferramentas negadas e
o supervisor externo limita a execução a uma etapa. A validação de configuração
preserva esse contrato. Fontes: [código da versão fixada](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/session/prompt.ts)
e [restrição de prefill do Claude](https://platform.claude.com/docs/en/api/errors#prefill-not-supported).

O corretor também usa o supervisor externo para limitar etapas, sem `agent.steps` na
configuração isolada, preservando a mesma compatibilidade com o modelo.

## O que é medido

O artefato `artifacts/ai-usage.json` contém somente agregados: perfil, modelo,
identificador de execução, duração, etapas, tokens de entrada/saída/raciocínio,
cache lido/escrito, decisão de política e custo estimado. Eventos repetidos da
mesma etapa não são somados duas vezes. Prompts, respostas de ferramentas,
raciocínio e logs brutos do provedor não são gravados nesse artefato.

O campo `estimatedCostUsd` soma o custo informado pelo OpenCode para cada etapa.
Isso é uma **estimativa calculada pelo agente com seu catálogo de preços**, e não
o custo faturado pelo provedor. `providerBilledCostUsd` permanece `null` até haver
uma integração de faturamento. Um resultado zero em um endpoint privado não
significa que GPU, infraestrutura ou operação são gratuitos.

Para Claude Code, o CLI é fixado em `2.1.306` pelo workflow e executa em modo
`--bare`: regras confiáveis são fornecidas explicitamente, sem descoberta de
hooks, plugins ou `CLAUDE.md`. A lista de ferramentas fica restrita, e os comandos
Bash liberados são Maven e leitura de status/diff do Git. O modelo não recebe um
token GitHub de escrita nem realiza publicação. `--max-turns` e
`--max-budget-usd` recebem os valores da política; timeout e tamanho de saída são
limitados pelo supervisor. O JSON final fornece `total_cost_usd`, `usage` e
`num_turns`; o wrapper normaliza esses campos, bloqueia falhas e ausências de uso
ou resumo e valida os limites novamente antes de permitir publicação.

O custo do Claude também é uma estimativa do cliente, com base
`claude-code-client-estimate`, nunca uma fatura. O formato e o modo bare estão
documentados no [modo programático do Claude Code](https://code.claude.com/docs/en/headless)
e os limites na [referência do CLI](https://code.claude.com/docs/en/cli-reference).
O coletor e o wrapper possuem testes com respostas simuladas. A validação real
de cada agente deve ser comprovada por sua execução no GitHub Actions; testes
simulados não demonstram conectividade ou acesso ao modelo.

`reportedTotalTokens` só é preenchido quando todas as etapas incluem o total.
`policyTokenUnits` soma entrada, saída, raciocínio e cache para aplicar um limite
conservador. Algumas dimensões podem se sobrepor conforme o provedor; essa unidade
não deve ser apresentada como o total faturável de tokens. Ausência de uso é
registrada como indisponível, nunca como custo ou consumo zero.

O parser segue os eventos `step_finish` e o schema da versão fixada
[OpenCode 1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/schema/src/v1/session.ts).
A emissão dos eventos está no
[comando `run`](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/cli/cmd/run.ts).

## Limite observado não é teto de cobrança

Uma etapa só informa o custo ao terminar. A requisição seguinte pode já ter sido
aceita pelo provedor quando o wrapper observa o excesso. Interrupções e falhas de
rede também podem deixar consumo ainda não reportado. Portanto, esses limites
**não garantem teto financeiro rígido**, e não desfazem despesas já realizadas.
Use limites de conta/projeto e um gateway de inferência com controle de orçamento
quando essa garantia for necessária. Confira o uso com a fonte de faturamento.

O comando `/oc` usa neste repositório o fluxo controlado, com validação da
aplicação completa e publicação isolada, em vez de delegar publicação ao
`opencode github run`. O comando `@claude` usa o mesmo pipeline com Claude Code.
A execução direta de `opencode github run`, uma action externa do Claude ou a
integração do Cursor possuem mecanismos próprios e não herdam esta coleta. Esses
caminhos devem ser tratados como consumo não coletado até sua integração.

## Preparação para um piloto corporativo

O repositório já separa inferência e publicação nos fluxos controlados, exige
autor autorizado e issue liberada, usa permissões mínimas, registra evidências de
testes e mantém a revisão humana como decisão de entrega. A revisão por IA é
consultiva.

O [engineering loop](engineering-loop.md) permite correção automática somente com a variável
`AI_LOOP_ENABLED=true` e a label `ai:autofix` na PR. O perfil `correction` limita cada execução
a 20 etapas, 600 segundos, estimativa de USD 3 e 750.000 unidades conservadoras de tokens.
São no máximo duas tentativas, com reserva estimada agregada de USD 9 para revisões/correções,
persistida antes de chamar o modelo. Falhas e cancelamentos consomem a reserva. O agente não
executa comandos; testes e publicação acontecem em etapas separadas. A decisão de merge
continua com o mantenedor. A reserva é um controle operacional estimado, não um teto de fatura.

A primeira revisão real demonstrou também o limite de analisar apenas um diff:
o modelo supôs ausência de limpeza de banco e helpers que já existiam na base.
Os 67 testes Java e a inspeção do código-base refutaram essas hipóteses. O revisor passou
a receber trechos limitados da base confiável e instruções para omitir hipóteses
sem evidência. Isso reduz contexto faltante, mas não transforma o comentário em
aprovação nem prova ausência de defeitos.

As revisões são serializadas por PR sem cancelar uma inferência já iniciada.
Isso preserva a coleta do consumo e dos artefatos. Se o SHA mudar, a publicação
descarta o resultado obsoleto; se já houver comentário para o mesmo SHA, a etapa
de inferência é ignorada. A reexecução real `39544635495` confirmou esse comportamento.

O [laboratório posterior da PR #32](validacao-engineering-loop.md) publicou duas correções
e parou em `needs-human`, com estimativa total de USD 0.53927370. A triagem assistida dos
achados finais antecedeu a integração autorizada. A conclusão técnica do workflow não é
uma aprovação da entrega. O [modelo de trabalho](modelo-de-trabalho.md) define esse acordo;
triagem estruturada já está implementada. Evidência durável fora da retenção dos artefatos
e quotas por equipe continuam propostas do [roadmap](roadmap.md).

Antes de conectar ambientes internos, os responsáveis devem definir:

- Provedores e modelos permitidos, classificação dos dados, retenção e destino de
  código, patches e prompts.
- Identidade de execução por GitHub App ou identidade de workload, permissões por
  repositório e acesso a secrets por ambiente. Preferir credenciais curtas quando
  a plataforma suportar esse mecanismo.
- Proteção de branch, verificações obrigatórias e revisão de responsáveis. Esses
  controles devem ser configurados na organização; documentos não os aplicam.
- Gateway de saída e inferência, quotas por equipe, faturamento e alertas.
- Exportação dos agregados e eventos de auditoria para o serviço aprovado de
  observabilidade, com responsáveis, retenção e identificação da mudança.
- Runners isolados e efêmeros, conectividade mínima e nenhuma credencial de
  produção em código gerado ou testes.

As integrações com IAM, SIEM, faturamento e infraestrutura da empresa não estão
implantadas neste projeto. A escolha entre nuvem e modelo privado deve ser
validada com as equipes responsáveis, usando inicialmente dados sintéticos.

## Proteção aplicada neste repositório

Em 21/10/2026 a `main` recebeu proteção efetiva pela API do GitHub: PR obrigatória,
checks `Repository checks`, `Build and tests` e `AI review gate`, branch atualizada, conversas resolvidas,
sem force push ou exclusão. As regras também se aplicam ao administrador.
O laboratório tem um único mantenedor e exige zero aprovações adicionais.
Para uma equipe, configure responsáveis e ao menos uma aprovação independente.

O arquivo `config/branch-protection.json` permite reproduzir a configuração do laboratório
com uma identidade administradora autorizada:

```sh
gh api --method PUT repos/OWNER/REPO/branches/main/protection \
  --input config/branch-protection.json
```

Uma regra aplicada não substitui controles de identidade da organização. A IA não
recebe credenciais de administrador, não altera a proteção e não aprova suas PRs.
