# Manual de uso das skills

Este manual explica as **11 skills registradas**, quando selecioná-las e que trabalho elas
orientam. O [catálogo operacional](skills-catalog.md) descreve configuração, limites,
proveniência e versões. As instruções efetivamente carregadas estão nos arquivos `SKILL.md`
indicados em cada seção.

Uma skill fornece instruções ao agente; a tarefa da issue determina a funcionalidade a
implementar. Selecionar uma skill não cria um endpoint, migration ou teste por si só.
O pipeline implementa a seleção, a composição do contexto, a validação e os registros de
auditoria. Graphify tem também uma etapa executável de extração do grafo. Os exemplos de
solicitação abaixo são ilustrativos e não representam funcionalidades novas já entregues.

## Começar uma tarefa

1. Descreva problema, escopo, contrato e critérios verificáveis na issue.
2. Escolha IDs no campo **Skills** do formulário ou acrescente a seção abaixo à descrição.
3. Se faltarem decisões, um colaborador autorizado comenta `/ai-spec` com a configuração
   de especificação habilitada. Revise as perguntas e incorpore as decisões na issue.
4. Para implementar, um colaborador adiciona `ai:ready` e comenta `/oc implemente esta issue`
   ou `@claude implemente esta issue`, conforme o agente habilitado.
5. Confira a draft PR, os testes e a revisão. Correção automática exige autorização própria
   do [engineering loop](engineering-loop.md); o mantenedor decide a integração.

```markdown
### Skills
superpowers, postgres-flyway, graphify
```

A seleção usa até oito IDs e acrescenta práticas aos padrões de cada fase. Não é necessário
selecionar explicitamente os padrões: `grill-me` e `superpowers-writing-plans` na
especificação, `java-spring-api` na implementação, `integration-tests` nos testes,
`code-review` na revisão e `java-spring-api`/`integration-tests` na correção.

| Necessidade | Skill e seção deste manual |
|---|---|
| Contrato HTTP e código Java/Spring | [java-spring-api](#java-spring-api) |
| Consultas, constraints e mudanças de esquema | [postgres-flyway](#postgres-flyway) |
| Regressão HTTP com banco real | [integration-tests](#integration-tests) |
| Analisar defeitos demonstráveis em uma PR | [code-review](#code-review) |
| Esclarecer decisões de produto/contrato | [grill-me](#grill-me) |
| Aplicar o conjunto de práticas por fase | [superpowers](#superpowers) |
| Decompor critérios em passos verificáveis | [superpowers-writing-plans](#superpowers-writing-plans) |
| Desenvolver a partir de uma regressão | [superpowers-test-driven-development](#superpowers-test-driven-development) |
| Encontrar a causa de uma falha | [superpowers-systematic-debugging](#superpowers-systematic-debugging) |
| Relatar conclusão com evidência observada | [superpowers-verification-before-completion](#superpowers-verification-before-completion) |
| Acrescentar contexto de dependências da base | [graphify](#graphify) |

## java-spring-api

**Fases:** implementação e correção. **Padrão nessas fases.**
Fonte: [instruções da skill](../skills/java-spring-api/SKILL.md).

### O que orienta

Seguir o comportamento de Controller → Service → Repository e as conversões de DTO/entidade
antes de alterar código. Preservar a normalização já existente, respostas ProblemDetail,
conflito de SKU, paginação e ordenação. Distinguir parâmetro ausente, vazio e inválido;
verificar combinações de filtros, limites inclusivos e desempate determinístico por ID.
Usar um contrato próprio para listagens distintas e atualizar o OpenAPI quando houver mudança pública.

### Quando e como usar

Use para mudar endpoints, validações, filtros ou regras do catálogo. Exemplo de solicitação:
“Adicionar filtro por SKU exato, definindo tratamento de espaços e maiúsculas, sem alterar
os filtros atuais”. A definição dessas regras pertence aos critérios da issue.

```markdown
### Skills
java-spring-api, superpowers-writing-plans
```

### Entrega esperada e conferência

Uma alteração pequena no caminho HTTP correspondente, testes dos casos definidos e
documentação OpenAPI coerente. Confira entradas válidas/inválidas, status e corpo retornado,
efeito no banco e preservação dos filtros atuais. A skill não autoriza mudança de contrato
fora da issue nem escolhe silenciosamente as regras ainda pendentes.

## postgres-flyway

**Fases:** implementação, testes, revisão e correção.
Fonte: [instruções da skill](../skills/postgres-flyway/SKILL.md).

### O que orienta

Examinar a consulta executada e as constraints do PostgreSQL, considerando gravações por SQL
quando o contrato admite esse caminho. Conferir a expressão usada em DISTINCT, normalização
e ORDER BY. Para esquema, criar uma migration nova e preservar as aplicadas. Manter
BigDecimal/tipo decimal para preços e testar rollback após requisição inválida.

### Quando e como usar

Use para alterar consultas, unicidade, precisão, índices ou estrutura de persistência.
Exemplo: adicionar um campo de domínio com limites explícitos e uma migration nova, incluindo
o comportamento dos registros existentes. A issue deve definir esse comportamento e o
procedimento de validação; a skill não executa migração em ambiente de produção.

```markdown
### Skills
postgres-flyway, integration-tests
```

### Entrega esperada e conferência

Consulta ou migration compatível com o contrato, mais testes com PostgreSQL real. Confira
constraints, dados anteriores, entradas que contornam a entidade quando relevantes e ausência
de efeitos após falha. Alterar somente anotações Java não comprova uma restrição no banco.
Na revisão, uma hipótese sobre outro banco ou um futuro provedor JPA não demonstra defeito atual.

## integration-tests

**Fases:** implementação, testes e correção. **Padrão em testes e correção.**
Fonte: [instruções da skill](../skills/integration-tests/SKILL.md).

### O que orienta

Escrever regressões que diferenciam a versão correta da defeituosa. Escolher entradas que
exponham a causa, como 21 categorias para revelar um corte de 20. Usar HTTP para o fluxo
normal e JDBC quando o cenário exige contornar a normalização da entidade. Em TestRestTemplate,
passar valores crus como variáveis de URI para evitar dupla codificação.

### Quando e como usar

Use em funcionalidades ou correções com efeito observável na API e no banco. Exemplo:
“Verificar todas as categorias com mais de uma página de produtos, variantes admitidas no
banco e exclusão da última ocorrência”. Esse é também um comportamento já coberto pelo
laboratório; confira a base antes de abrir uma nova tarefa equivalente.

```markdown
### Skills
integration-tests, postgres-flyway
```

### Entrega esperada e conferência

Testes `*IT.java` com status, corpo e estado persistido; casos vazio, limite, inválido e
combinação relevante. `./mvnw -B -ntp verify` deve executar com Docker/PostgreSQL real e
sem ignorar falhas de infraestrutura. O corretor escreve testes, mas os jobs independentes
os executam. Escrever a regressão não comprova que a versão anterior foi executada e falhou.

## code-review

**Fase:** revisão. **Padrão nessa fase.**
Fonte: [instruções da skill](../skills/code-review/SKILL.md).

### O que orienta

Avaliar o diff sobre a base fornecida, incluindo setup de testes e normalizadores.
Exigir entrada admitida pelo contrato, evidência do defeito e consequência concreta.
Evitar achados duplicados, suposições sobre código omitido e severidade baseada em cenários
hipotéticos. Pedir teste somente quando ele demonstraria um defeito.

### Quando e como usar

Ela é aplicada automaticamente nas revisões controladas. Para uma mudança de persistência,
a seleção pode acrescentar `postgres-flyway` desde a issue:

```markdown
### Skills
code-review, postgres-flyway
```

O publisher herda a seleção na PR. Para revisar uma PR pelo workflow, um colaborador autorizado
pode usar `gh workflow run ai-review.yml --ref main -f pull_request=NUMERO`, respeitando
as variáveis e condições do [fluxo de revisão](setup-cloud.md#revisão-real).

### Entrega esperada e conferência

Parecer em português e JSON `{summary, findings}` validado pelo executor. Cada achado aponta
arquivo e linha alterada, com prioridade P0–P3, evidência e impacto; sem defeito demonstrado,
`findings` fica vazio. Confira o SHA revisado, o envelope do bot, `review.json`, consumo e
`skills-manifest.json`. A skill não aprova a PR nem corrige código; o revisor não tem ferramentas.

## grill-me

**Fase:** especificação. **Padrão nessa fase.**
Fonte: [instruções da skill](../skills/grill-me/SKILL.md).

### O que orienta

Organizar decisões como uma árvore e perguntar sobre a fronteira que pode ser decidida
agora. Agrupar até cinco perguntas independentes, cada uma com ID, recomendação e impacto.
Reaproveitar fatos disponíveis e aguardar respostas antes de decisões dependentes. A adaptação
inclui a prática `grilling` do upstream, sem invocação recursiva de outra skill.

### Quando e como usar

Use quando a issue deixa abertas regras como acentos, normalização, compatibilidade ou
comportamento de dados existentes. Com `AI_ENABLED=true` e `AI_SPEC_ENABLED=true`, comente:

```text
/ai-spec A busca deve aceitar trechos do nome. Identifique decisões pendentes de contrato.
```

Uma pergunta ilustrativa seria: “A busca deve ignorar acentos?” com recomendação e efeito
nos testes/consulta. Responda atualizando a issue ou em uma nova rodada que contenha o contexto:

```text
/ai-spec Decisão Q1: ignorar maiúsculas e preservar acentos. Proponha os critérios restantes.
```

### Entrega esperada e conferência

Comentário com resumo, perguntas e critérios propostos. `needs-input` indica decisões
pendentes; `draft-ready` continua sendo uma proposta para avaliação humana. Confira se as
recomendações foram explicitamente aceitas antes de incorporá-las. A rodada recebe a issue
atual e o comentário atual, sem todo o histórico. Não altera a descrição, adiciona labels
ou inicia código. Cada novo comando pode gerar consumo, sujeito à política de especificação.

## superpowers

**Fases:** especificação, implementação, testes, revisão e correção.
Fonte: [instruções da skill](../skills/superpowers/SKILL.md) e
[referências por fase](../skills/superpowers/references/).

### O que orienta

É o pacote geral adaptado para este fluxo. O loader fornece seu guia e somente as referências
da fase: desenho/plano na especificação; incremento pequeno na implementação; evidências
nos testes; reconstrução de hipóteses na revisão; reparo mínimo por causa demonstrada na
correção. Mantém fatos, propostas e decisões separados.

### Quando e como usar

Use para aplicar o conjunto de práticas a uma tarefa que atravessa várias etapas.

```markdown
### Skills
superpowers, postgres-flyway, graphify
```

Exemplo de solicitação: definir um novo filtro, implementar a menor alteração coerente,
testar a combinação com filtros existentes e revisar o impacto. Os adaptadores individuais
abaixo permitem escolher somente uma prática quando o pacote geral não é necessário.

### Entrega esperada e conferência

Critérios claros, incremento dentro do escopo, regressões e relato de validação nas fases
aplicáveis. Confira `manifest.used` e `resources`: uma revisão deve receber a referência de
revisão, sem referências exclusivas de implementação. O pacote não instala o framework
upstream, hooks, worktrees ou subagentes e não publica/integra código.

## superpowers-writing-plans

**Fases:** especificação e implementação. **Padrão na especificação.**
Fonte: [instruções da skill](../skills/superpowers-writing-plans/SKILL.md).

### O que orienta

Transformar cada critério em um passo com caminho provável de código, regressão, alteração
mínima e evidência de conclusão. Tornar dependências explícitas e manter o plano proporcional
à tarefa. Uma decisão de contrato ausente vira pergunta na especificação.

### Quando e como usar

Use quando uma tarefa envolve, por exemplo, entrada HTTP, consulta e testes combinados:

```markdown
### Skills
superpowers-writing-plans, postgres-flyway
```

Para a solicitação ilustrativa de filtro por SKU, um plano pode ligar: regra de normalização
aprovada → teste HTTP → consulta → OpenAPI → validação. Arquivos e detalhes devem ser
confirmados na base; o exemplo não fixa uma implementação obrigatória.

### Entrega esperada e conferência

Uma decomposição rastreável aos critérios, sem passos de refatoração não solicitados.
Na especificação, ela orienta perguntas e critérios dentro do JSON permitido; não existe
um campo de plano separado no resultado de `/ai-spec`. Na implementação, o plano orienta
o trabalho do agente, sem garantia de gerar `plan.md` ou outro arquivo específico. Não cria
novas issues, aprovações ou execuções automaticamente.

## superpowers-test-driven-development

**Fases:** implementação, testes e correção.
Fonte: [instruções da skill](../skills/superpowers-test-driven-development/SKILL.md).

### O que orienta

Começar pelo comportamento observável que falha, fazer a mudança mínima para atendê-lo e
refatorar com a regressão preservada. Quando o implementador pode executar comandos,
observar a falha do teste antes da correção. Falha por Docker indisponível não demonstra
o defeito do produto. Asserções não devem ser enfraquecidas para obter sucesso.

### Quando e como usar

Use para uma funcionalidade nova ou um bug com entrada reproduzível:

```markdown
### Skills
superpowers-test-driven-development, integration-tests
```

Na issue, forneça entrada, resultado observado e esperado. Solicite que a regressão exponha
essa diferença antes de modificar produção e que os comandos executados sejam identificados.

### Entrega esperada e conferência

Teste que distingue erro/correção e alteração de produção proporcional à causa. Confira o
diff e os resultados do comando, com o SHA correspondente. Uma suíte verde após a mudança
não prova, por si só, que houve uma execução vermelha anterior. No corretor isolado, comandos
permanecem proibidos: ele escreve a regressão e a execução ocorre depois, em jobs independentes.

## superpowers-systematic-debugging

**Fases:** implementação e correção.
Fonte: [instruções da skill](../skills/superpowers-systematic-debugging/SKILL.md).

### O que orienta

Partir da entrada e dos resultados observado/esperado, traçar validação, normalização,
serviço e consulta, e formular uma hipótese de causa com teste que a diferencie das
alternativas. Evitar alterações especulativas acumuladas e distinguir produto, ambiente
e contexto insuficiente.

### Quando e como usar

Use para um resultado inesperado que ainda precisa de causa demonstrada. Exemplo:
“Uma entrada admitida pelo contrato devolve status incorreto; seguem payload, resposta e
critério esperado”. Inclua os fatos reais e remova credenciais antes de escrever a issue.

```markdown
### Skills
superpowers-systematic-debugging, postgres-flyway
```

### Entrega esperada e conferência

Uma explicação causal sustentada pelo código e uma regressão que reproduza o cenário,
seguida de reparo mínimo. Confira se o teste diferencia a hipótese e se a alteração atua
na causa identificada. Na correção, a investigação usa apenas os arquivos fornecidos,
sem comandos ou serviços externos; um parecer sem evidência suficiente pode exigir
intervenção humana em vez de uma mudança fictícia.

## superpowers-verification-before-completion

**Fases:** implementação, testes, revisão e correção.
Fonte: [instruções da skill](../skills/superpowers-verification-before-completion/SKILL.md).

### O que orienta

Associar cada afirmação de conclusão a uma verificação observada. Distinguir testes
unitários, PostgreSQL real, imagem Docker, aceitação HTTP e chamada ao provedor. Explicitar
o que está planejado, executado, aprovado ou ainda não verificado.

### Quando e como usar

Use quando a entrega exige evidência reproduzível, como uma demonstração ou mudança com
vários critérios de aceite:

```markdown
### Skills
superpowers-verification-before-completion, integration-tests
```

Na issue, peça que o resumo associe os critérios às verificações executadas e aos resultados
disponíveis. Os artefatos concretos continuam sendo gerados pelos scripts/workflows.

### Entrega esperada e conferência

Relato com evidência e limitações, sem declarar que o provedor real foi testado quando se
usou um mock. Confira relatórios, SHA, execução e consumo; uso indisponível permanece
indisponível. No revisor/corretor, a skill não libera comandos. CI verde não equivale a
aprovação humana, e o carregamento da skill não prova ganho de qualidade.

## graphify

**Fases:** especificação, implementação, revisão e correção.
Fonte: [instruções da skill](../skills/graphify/SKILL.md).

### O que implementa no pipeline

Além de orientar o uso do grafo, a seleção ativa uma etapa real de preparação: o helper
copia fontes versionadas da base confiável e limpa, executa `graphifyy==0.9.93` em modo AST
com `GRAPHIFY_BACKEND=none` e injeta um resumo validado no contexto da fase.
Não executa scripts/aplicação copiados nem código da PR.

### Quando e como usar

Use quando relações entre arquivos/componentes ajudam a localizar impacto, por exemplo
uma mudança que passa por Controller, Service e Repository:

```markdown
### Skills
graphify, java-spring-api, postgres-flyway
```

O pipeline instala a CLI em virtualenv temporário quando ela está selecionada para a fase.
Não é necessário instalá-la no computador para iniciar uma issue. Para inspecionar a extração
local, use um checkout limpo e o comando documentado no [catálogo](skills-catalog.md#graphify-preparado-pelo-pipeline).

### Entrega esperada e conferência

`graph-context.json` com commit, hashes das fontes/grafo, contagens, relações e omissões.
O contexto inclui `from`, `to`, `relation`, `confidence`, `file` e `location`. Confira se
`sourceCommit` é o commit confiável do manifesto e considere a cobertura parcial:
são até 200 arquivos, 300.000 bytes por arquivo, 120 segundos e 4.000 bytes de resumo.
As relações podem indicar `EXTRACTED`, `INFERRED` ou `UNKNOWN`.

O grafo representa a base, não a versão resultante do patch. Relação ausente não comprova
ausência de chamada/método. O revisor recebe texto e continua sem ferramentas. Se a preparação
selecionada falhar, a inferência não começa. Extração semântica com LLM, hooks, MCP, serviços
externos e funcionalidades de mídia/nuvem do upstream não fazem parte deste adaptador.

## Combinar skills e conferir o uso efetivo

| Tipo de tarefa | Seleção adicional sugerida |
|---|---|
| Requisitos ainda abertos | `grill-me`, `superpowers-writing-plans` — já são padrões da especificação |
| Funcionalidade Java com persistência | `superpowers`, `postgres-flyway` |
| Bug reproduzível | `superpowers-systematic-debugging`, `superpowers-test-driven-development` |
| Mudança com dependências entre componentes | `graphify`, `postgres-flyway` |
| Entrega com evidências de demonstração | `superpowers-verification-before-completion` |

Selecione conforme o problema; incluir todos os IDs não melhora automaticamente uma tarefa.
A soma de instruções tem limite de 16.000 bytes. Skills incompatíveis com a fase ficam
registradas como selecionadas, mas não entram em `used` nessa rodada.

Nos artefatos da execução, abra `skills-manifest.json` e confira:

| Campo | Como interpretar |
|---|---|
| `selected` | IDs explícitos da issue/PR, normalizados |
| `used` | Skills efetivamente carregadas, incluindo padrões e somente fases aplicáveis |
| `used[].resources` | Recursos usados naquela fase, com seus hashes |
| `catalogCommit`, `catalogHash` | Origem e integridade do catálogo confiável |
| `contextHash`, `contextBytes` | Identificação e tamanho do contexto composto |

A PR gerada preserva os IDs no marcador `continuous-ai-skills`; cada nova fase resolve seu
conteúdo no catálogo confiável daquela execução. Alterar a descrição da issue depois da
publicação não troca silenciosamente a seleção congelada na PR. Revisão continua idempotente
por SHA: editar somente a seleção não solicita outra inferência no mesmo commit.

Se houver ID desconhecido, seção duplicada, hash divergente ou contexto excessivo, corrija
a seleção/fonte na origem apropriada e faça uma nova solicitação autorizada. URLs e caminhos
arbitrários não são aceitos como IDs. O catálogo não carrega os arquivos de `skills/upstream/`
como instruções de execução; eles preservam origem, autoria e licenças.

Para configuração e consumo, consulte [setup-cloud.md](setup-cloud.md) e
[governance.md](governance.md). Para os resultados realmente executados, consulte
[validacao-skills.md](validacao-skills.md). Ganho de qualidade precisa ser medido com a
[avaliação do revisor](reviewer-evaluation.md), não inferido pela presença de uma skill.
