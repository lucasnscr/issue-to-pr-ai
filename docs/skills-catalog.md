# Skills por issue e fase

O catálogo fornece práticas reutilizáveis para especificar, desenvolver, testar e revisar.
A issue seleciona **IDs**, e o pipeline carrega os arquivos aprovados da branch confiável.
As mesmas seleções acompanham a draft PR e suas correções. Skills complementam `AGENTS.md`;
não concedem ferramentas, publicação, merge, subagentes ou orçamento adicional.

Este conjunto foi escolhido pela adequação ao Java/Spring/PostgreSQL deste projeto e por
ter fontes públicas verificáveis. Não existe aqui uma medição que demonstre que sejam as
“melhores do mercado” ou que melhorem a qualidade do revisor. Use a
[avaliação versionada](reviewer-evaluation.md) para medir mudanças de comportamento.

## Catálogo inicial

| ID | Fases | Prática |
|---|---|---|
| `java-spring-api` | Implementação, correção | Contratos, DTOs, normalização, paginação e BigDecimal |
| `postgres-flyway` | Implementação, testes, revisão, correção | SQL e restrições reais, migrations imutáveis |
| `integration-tests` | Implementação, testes, correção | Regressão HTTP/PostgreSQL, limites, vazios e entrada inválida |
| `code-review` | Revisão | Defeitos demonstráveis, contexto existente e impacto concreto |
| `grill-me` | Especificação | Perguntas sobre decisões pendentes, com recomendação e impacto |
| `superpowers` | Todas | Práticas de planejamento, TDD, diagnóstico, revisão e verificação, filtradas por fase |
| `superpowers-writing-plans` | Especificação, implementação | Tarefas pequenas, caminhos, critérios e validação |
| `superpowers-test-driven-development` | Implementação, testes, correção | Regressão antes da mudança e verificação observável |
| `superpowers-systematic-debugging` | Implementação, correção | Hipótese, evidência, causa e reparo mínimo |
| `superpowers-verification-before-completion` | Implementação, testes, revisão, correção | Relatar somente validações executadas e seus limites |
| `graphify` | Especificação, implementação, revisão, correção | Relações AST preparadas a partir da base confiável |

Padrões por fase, sempre incluídos:

| Fase | Skills padrão |
|---|---|
| Especificação | `grill-me`, `superpowers-writing-plans` |
| Implementação | `java-spring-api` |
| Testes | `integration-tests` |
| Revisão | `code-review` |
| Correção | `java-spring-api`, `integration-tests` |

A seleção acrescenta skills aos padrões; somente recursos da fase são carregados. Selecionar
`grill-me` não o injeta no revisor. O pacote `superpowers` carrega seu guia geral e somente
as referências correspondentes à fase. Os adaptadores individuais permitem uma seleção menor.

## Selecionar na issue

Use o campo **Skills** do formulário. Em uma issue escrita manualmente, mantenha este título
exato, fora de blocos de código:

```markdown
### Skills
superpowers, postgres-flyway, graphify
```

Há um limite de oito IDs e 16.000 bytes de instruções por execução. IDs desconhecidos,
URLs, caminhos, seções duplicadas, arquivos simbólicos ou hashes divergentes bloqueiam
antes da inferência. O contexto não é truncado para encaixar seleções excessivas.
`superpower` e `grapify` são aliases de compatibilidade para `superpowers` e `graphify`.
O formulário apresenta os nomes oficiais. Issues legadas sem seção ou com o campo vazio
usam somente os padrões.

Exemplo para uma mudança no catálogo:

```markdown
### Problema e resultado esperado
Adicionar busca por trecho do nome sem alterar os filtros existentes.

### Critérios de aceite
- Combinar busca com categoria, preço, paginação e ordenação atuais.
- Definir explicitamente espaços externos, maiúsculas/minúsculas e acentos.
- Testar correspondência, nenhum resultado e parâmetro inválido com PostgreSQL real.
- Atualizar OpenAPI e critérios HTTP independentes do agente.

### Skills
superpowers, postgres-flyway, graphify

### Escopo e restrições
Somente API, testes e Markdown; manter contratos existentes e migrations aplicadas.
```

## Especificar com `/ai-spec`

Depois que os workflows estiverem na branch padrão, configure `AI_ENABLED=true` e
`AI_SPEC_ENABLED=true`. O modelo opcional `SPEC_MODEL` usa por padrão
`anthropic/claude-sonnet-4-6`, com a credencial já usada pelo OpenCode.

Um colaborador com `write`, `maintain` ou `admin` comenta em uma issue aberta:

```text
/ai-spec Identifique decisões pendentes e proponha critérios verificáveis.
```

A rodada recebe a descrição atual, esse comentário, as skills de especificação e o grafo
opcional. O agente não tem ferramentas. A resposta tem resumo, até cinco perguntas
independentes com recomendação/impacto e até dez critérios propostos. `needs-input` indica
decisões pendentes; `draft-ready` indica uma proposta pronta para avaliação humana.
Nenhum desses estados adiciona `ai:ready`, modifica a descrição ou inicia implementação.

Para uma nova rodada, atualize a issue com as decisões ou inclua o contexto necessário no
novo comentário, por exemplo:

```text
/ai-spec Decisão Q1: ignorar maiúsculas e manter acentos. Espaços externos são removidos.
Revise a proposta considerando essas decisões e a descrição atual.
```

O histórico inteiro da conversa não é fornecido ao modelo. Copie as decisões importantes
para a descrição ou para o novo comando. Cada comentário é uma nova rodada paga; repetir a
mesma execução não publica outra resposta. O publisher reconsulta permissão, estado, descrição
e comentário antes de publicar e rejeita resultado desatualizado. Uma falha de uso/JSON não
publica proposta. A política limita cada rodada a uma etapa, 540 segundos, estimativa de
USD 1 e 80.000 unidades conservadoras de tokens, separadas da reserva do ciclo da PR.

Após revisar e incorporar os critérios na issue, o responsável adiciona `ai:ready` e comenta
`/oc implemente esta issue` ou `@claude implemente esta issue`. O fluxo de implementação
continua exigindo produção Java, teste de integração e validações independentes.

## Seleção e proveniência na PR

`scripts/skills.cjs` é o loader comum. Ele verifica
[`config/skills-catalog.json`](../config/skills-catalog.json), resolve os recursos aprovados
e gera `skills-manifest.json`: IDs selecionados/usados, fase, versão, hashes dos recursos e
do contexto, hash do catálogo e commit confiável. Implementação, especificação, revisão e
correção preservam o manifesto em seus artefatos de 14 dias. Pareceres exibem IDs e hash do
catálogo; a avaliação do revisor registra o manifesto padrão junto ao hash do prompt.

O publisher inicial monta o manifesto novamente no checkout confiável e registra a seleção
na descrição da PR por um marcador `continuous-ai-skills`. Esse marcador congela os **IDs**;
uma edição posterior da issue não muda silenciosamente a seleção da PR. Ele não autoriza
executar arquivos nem constitui uma assinatura de segurança. Revisão e correção revalidam
os IDs e usam o conteúdo do catálogo confiável daquela execução, nunca o conteúdo do head.
O manifesto de cada rodada permite identificar qual versão foi efetivamente usada.

Em PR legada, o loader lê a seção Skills de uma única issue vinculada por `Closes #N`,
`Fixes #N` ou `Resolves #N`; sem vínculo, usa padrões. Vínculos ambíguos são rejeitados.
Sem novo commit, a revisão existente continua idempotente por SHA: editar somente a seleção
não dispara nem invalida uma revisão já publicada. Planeje a seleção antes de implementar.

O revisor mantém `permission: {"*":"deny"}`. O corretor permanece em diretório isolado,
sem comandos; testes e publicação acontecem em jobs independentes. Uma skill de TDD orienta
o corretor a escrever uma regressão, mas não permite que ele execute testes ou alegue ter
observado um teste vermelho. Os limites de duas tentativas e USD 9 do ciclo permanecem.

## Graphify preparado pelo pipeline

O adaptador usa a CLI real **`graphifyy==0.9.93`** em um virtualenv temporário e executa:

```sh
GRAPHIFY_BACKEND=none graphify extract . --code-only --no-cluster --no-viz
```

Antes do modelo, `graphify-context.py` copia somente fontes versionadas de
`apps/catalog-api/src`, `scripts` e `.github/scripts` do checkout confiável e limpo.
O parser recebe HOME temporário e ambiente sem chaves de provedor/GitHub/cloud.
Não instala hooks, MCP, guards ou configurações globais e não chama backend semântico.
Não executa aplicação, scripts copiados nem código candidato.

Limites: 200 arquivos, 300.000 bytes por arquivo, extração de 120 segundos e resumo de
4.000 bytes. `graph-context.json` registra commit, hashes das fontes/grafo, contagens,
relações e omissões. Relações de arquivos alterados têm preferência na revisão/correção.
O resumo distingue `EXTRACTED`, `INFERRED` e `UNKNOWN`; extração com tokens de modelo é
rejeitada. Ausência de relação não prova ausência de dependência ou defeito. O grafo descreve
a **base**, e o patch deve ser considerado separadamente. Se selecionado e a preparação
falhar, a execução para antes da inferência; não há fallback silencioso sem o grafo.

CI executa um smoke da CLI real sem credenciais. Fora da CI, em um checkout limpo:

```sh
python3 -m venv .tools/graphify-env
.tools/graphify-env/bin/pip install 'graphifyy==0.9.93'
python3 scripts/graphify-context.py \
  --command "$PWD/.tools/graphify-env/bin/graphify" --output .tools/graph-context.json
```

## Fontes, licenças e atualização

Os arquivos originais ficam em [`skills/upstream`](../skills/upstream/), com hash individual
e commit em [`skills/upstream.lock.json`](../skills/upstream.lock.json). Eles são referências
de autoria, não instruções carregadas automaticamente:

| Fonte | Revisão fixada | Licença / adaptação |
|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers/tree/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b) | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | MIT; planejamento/TDD/diagnóstico/verificação/revisão, sem hooks ou delegação automática |
| [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | `5beb35b040e3de97e54fa9e386d7e42d15c295c2` | MIT; grill-me **e sua dependência grilling**, rodadas explícitas para Actions |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify/tree/847a93f3cab5e2c82ea9170014b21cd2c52a4417) | `847a93f3cab5e2c82ea9170014b21cd2c52a4417` | Apache-2.0; LICENSE/NOTICE preservados, subconjunto de parsing AST |

Os onze adaptadores seguem o formato `SKILL.md` com nome, descrição e recursos de apoio do
[padrão Agent Skills](https://agentskills.io/specification). Não foram instalados como plugins
globais do Claude/Cursor/OpenCode. O carregamento explícito permite usar as mesmas instruções
com OpenCode e Claude Code em modo bare. A integração atual do Cursor não recebe esse catálogo
automaticamente; uma futura integração deve usar o mesmo contrato de seleção/proveniência.

Para atualizar, faça uma PR dedicada: leia o diff do upstream, preserve licenças/NOTICE,
atualize a revisão e seus hashes, adapte as instruções sem ampliar permissões e incremente
a versão das skills alteradas. Recalcule hashes dos recursos e valide:

```sh
node scripts/validate-skills.cjs
node --test scripts/tests/*.test.cjs
.venv/bin/python scripts/validate_config.py
./mvnw -B -ntp verify
```

Para revisão, execute também a avaliação versionada antes de atribuir ganho de qualidade.
As [evidências desta entrega](validacao-skills.md) distinguem CLI real, testes simulados e
o fluxo GitHub que depende da implantação na branch padrão.
