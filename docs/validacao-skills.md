# Validação do catálogo de skills

Atualização posterior: a [validação da referência](validacao-reference-method.md) registra
execuções reais de especificação e revisão com skills, Graphify e idempotência. O relato
abaixo preserva o escopo e as limitações observados na entrega original do catálogo.

Entrega vinculada à [issue #45](https://github.com/lucasnscr/issue-to-pr-ai/issues/45), em
21/10/2026. O [guia](skills-catalog.md) descreve o uso e a [arquitetura](architecture.md)
mostra o fluxo. A aplicação e seus contratos não foram alterados nesta entrega.
O [manual das 11 skills](skills-usage.md) detalha uso, efeito esperado, exemplos e
conferência individual.

## Validação para integração da PR #46

A [PR #46](https://github.com/lucasnscr/issue-to-pr-ai/pull/46) recebeu revisão do diff de
seleção, herança de IDs, composição dos prompts, permissões, extração de grafo e publicação
de especificação. Não foram identificados defeitos bloqueantes nessa inspeção. Ela foi
feita pelo Codex, sem uma chamada ao workflow de revisão por IA com provedor externo e
sem representar revisão humana independente.

A validação local foi repetida antes da integração: 153 testes Node e 84 Java com
PostgreSQL real, catálogo/licenças/hashes válidos e configuração sem erros. Os 11 exemplos
de seleção do novo manual foram resolvidos pelo loader para todas as fases; todos os IDs
registrados têm seção e link para suas instruções, com caminhos locais válidos.

A [CI 39703275257](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39703275257),
do commit `368ab78e8ddddc8a9c062d40c9bb09b5f8dd568f`, aprovou `Repository checks` e
`Build and tests`, incluindo Graphify real, Maven/PostgreSQL, imagem Docker e aceitação
HTTP. A documentação adicional passa pela mesma CI a cada novo commit da PR; o estado
dos checks no GitHub identifica a execução correspondente ao último SHA.

O check obrigatório `AI review gate` desta PR usa o caminho manual permitido para uma
alteração sem autorização de inferência. Seu sucesso não significa que houve uma revisão
do provedor. O merge solicitado pelo mantenedor continua sujeito aos checks obrigatórios
do commit atual, sem remover proteções ou usar bypass administrativo.

## Evidência local

| Verificação | Resultado |
|---|---|
| `node --test scripts/tests/*.test.cjs` | 153 testes aprovados; inclui seleção/fases, integridade, herança na PR/correção, Graphify e especificação |
| `node scripts/validate-skills.cjs` | 11 skills e 3 fontes fixadas; recursos e originais/licenças com hashes válidos |
| Validador do skill-creator | Os 11 adaptadores `SKILL.md` foram validados; arquivos originais de terceiros são referências preservadas |
| `.venv/bin/python scripts/validate_config.py` | 25 arquivos YAML, POMs, seleções do formulário, políticas e permissões válidos |
| `rhysd/actionlint:1.7.12` | Workflows sem erros de lint |
| `./mvnw -B -ntp verify` | 84 testes Java aprovados, incluindo 82 de integração com PostgreSQL/Testcontainers; zero ignorados |
| Avaliação offline do revisor | 6 casos, respostas fornecidas, resultado válido; proveniência inclui o novo manifesto/hash do prompt |

Os testes de especificação simulam o provedor e a API GitHub. Verificam permissão de escrita,
ator humano, issue aberta, rejeição de base movida, seleção desconhecida, limites de saída,
idempotência por comentário e descarte de resultado após editar issue/comentário ou revogar
permissão. Não existe método de alterar issue/labels ou iniciar implementação no publisher.
O agente dedicado `specifier` tem todas as ferramentas negadas. Uso ausente/inválido ou acima
da política bloqueia o resultado; o publisher revalida a telemetria antes de comentar.

Os testes de prompts comprovam que as seleções chegam ao implementador/revisor/corretor,
que fases incompatíveis são filtradas e que hashes divergentes bloqueiam antes da chamada.
O corretor continua sem comandos; não há aumento de tentativas ou da reserva do ciclo.
Testes com respostas simuladas validam contratos e controles, não a qualidade de respostas reais.

## Graphify real

A CLI `graphifyy==0.9.93` foi instalada em virtualenv isolado, sem hooks nem configurações
globais. Um primeiro corpus Java de prova produziu **4 nós e 3 relações**, com
`GRAPHIFY_BACKEND=none`, `--code-only`, `--no-cluster` e `--no-viz` e zero tokens de modelo.

O helper processou o checkout `1fc37fa4b0ab42e27faf5cd9987d35aaa62aba89`:
**75 arquivos, 681 nós e 1.536 relações**. O resumo contém **23 relações / 3.946 bytes**;
as outras 1.513 relações estão explicitamente contabilizadas como omitidas. As relações
incluídas têm confiança `EXTRACTED`. Hash das fontes:
`9e0ec800c1c818d86a5a482dc8dc15e7ac4fcbe95a83890ff7e2f3c30358c704`.
Hash do grafo completo: `80231b27e6b8d0e3e57699ad01836b522b5611b116d83b02fa6522c9138d5a7f`.
O helper rejeita consumo de tokens semânticos; a execução concluiu em modo AST sem modelo.
A CI também executa o helper com a CLI real, sem credenciais de inferência.
Artefatos temporários, virtualenvs e relatórios não são versionados.

Um smoke adicional selecionou `graphify`, `superpowers` e `postgres-flyway`, executou o
adaptador real de preparação e entregou grafo e instruções ao runner de revisão. A chamada
ao modelo foi simulada nesse smoke; a leitura, extração, validação de origem e composição
do prompt usaram os scripts reais. Isso comprova o encadeamento local, não uma revisão real
do provedor com essa seleção.

Os testes do helper usam uma CLI simulada para confirmar isolamento das fontes versionadas,
remoção de credenciais e configs de usuário, limite de bytes UTF-8, indicação de omissões,
rejeição de fonte suja, versão divergente e consumo semântico. O smoke real complementa
esses testes e verifica a compatibilidade com o formato produzido pela versão fixada.

## O que permanece sem validação com provedor

O novo `/ai-spec` e uma entrega completa issue → PR → revisão/correção com a seleção de
skills ainda não foram validados com provedor nesta entrega. Para exercitá-los, os workflows
precisam estar na branch padrão e `AI_SPEC_ENABLED=true` deve estar configurado para a
especificação. CI e testes locais não são evidência dessa
execução com o modelo. As execuções anteriores do engineering loop permanecem documentadas
nos relatórios históricos, com os prompts/políticas usados à época.

A avaliação offline reutiliza respostas conhecidas: suas métricas não medem o efeito das
novas skills. Para atribuir ganho ao catálogo, comparar execuções reais no mesmo dataset,
modelo e versão de política, registrando manifesto, consumo e variabilidade. O roadmap
inclui essa comparação como próximo incremento; nenhuma superioridade foi demonstrada aqui.
