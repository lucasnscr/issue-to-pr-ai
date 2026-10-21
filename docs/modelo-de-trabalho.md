# Modelo de trabalho com desenvolvimento assistido por IA

Este guia define um processo que uma equipe pode adotar: uma tarefa pequena e verificável
entra por issue; a automação propõe e valida código; o mantenedor avalia as evidências e
decide a integração. O catálogo é a aplicação de referência desse processo.

O fluxo atual suporta OpenCode e Claude Code na implementação e OpenCode na revisão/correção.
O corretor é opcional. [Cursor](cursor.md) é uma alternativa documentada, ainda sem execução
autenticada neste laboratório. A [arquitetura](architecture.md) descreve os componentes e o
[roadmap](roadmap.md) reúne melhorias propostas para reutilização e operação por equipes.

## Papéis e responsabilidade pela entrega

| Papel | Decisão ou evidência esperada |
|---|---|
| Autor da tarefa | Explicar o problema, o comportamento esperado e exemplos verificáveis |
| Responsável pelo domínio | Confirmar contrato, riscos da mudança e critérios de aceite |
| Colaborador com escrita | Autorizar a issue e decidir se o corretor pode ser usado |
| Agente | Propor o menor patch que atenda aos critérios e acrescentar testes |
| Validação independente | Conferir escopo, executar testes e preservar os resultados do commit |
| Revisor por IA | Publicar hipóteses de defeito e evidências associadas ao SHA |
| Mantenedor/revisor técnico | Fazer a triagem dos achados, revisar o diff e decidir a integração |

Uma pessoa pode acumular papéis no laboratório. Para uma equipe, defina um revisor diferente
de quem produziu a alteração e aplique a regra na proteção da branch. A autorização de merge
delegada ao Codex no laboratório não comprova revisão humana independente.

## Quando uma issue está pronta para execução

Use este acordo antes de adicionar `ai:ready`:

- Há um problema concreto e uma única tarefa, com exemplos de entrada e saída.
- O escopo informa os caminhos autorizados e os contratos a preservar.
- Os critérios descrevem comportamento nominal, casos vazios/limítrofes e entrada inválida.
- Dados de teste são sintéticos, e ambiente e comandos de validação estão disponíveis.
- A tarefa cabe no perfil atual e tem um responsável para acompanhar a execução e seus custos.

O formulário oferece um [catálogo de skills](skills-catalog.md) por fase. Escolha práticas
adequadas à tarefa e use `/ai-spec` para esclarecer decisões quando habilitado. A rodada
propõe perguntas e critérios; o responsável decide e atualiza a issue antes de liberar
implementação. As recomendações da IA e o estado `draft-ready` não constituem autorização.

O caminho automático atual aceita aplicação, testes e Markdown e exige Java de produção e
um teste `*IT.java`. Documentação isolada, dependências, workflows e infraestrutura precisam
de uma PR dedicada conduzida pelo mantenedor. Não amplie os caminhos ou retire testes apenas
para fazer uma tarefa incompatível passar pelo gate.

Modelo de descrição para copiar:

```markdown
## Problema
Qual comportamento precisa mudar e para quem?

## Escopo e contrato
Quais arquivos/componentes podem mudar? Quais contratos devem ser preservados?

## Critérios de aceite

- Caso nominal: entrada e resultado esperado.
- Caso vazio/limítrofe: entrada e resultado esperado.
- Entrada inválida: resposta e ausência de efeito indevido.
- Regressão: comportamentos existentes que devem continuar funcionando.

## Validação
Comandos e critérios HTTP independentes, com dados sintéticos.

### Skills
superpowers, postgres-flyway, graphify

## Responsável pela avaliação
Pessoa que conferirá os resultados e a necessidade de intervenção.
```

## Rotina de uma entrega

| Etapa | Ação da equipe | Evidência de saída |
|---|---|---|
| Preparar | Revisar a issue e seu escopo | Critérios verificáveis e responsável definido |
| Especificar, opcional | Escolher skills e comentar `/ai-spec`; responder e incorporar decisões | Proposta rastreável e decisões explícitas na issue |
| Autorizar | Adicionar `ai:ready`; opcionalmente `ai:autofix`; comentar `/oc` ou `@claude` | Ator autorizado e execução identificada |
| Implementar | Acompanhar a execução sem reenviar comandos em paralelo | Patch, telemetria e resultados das validações |
| Publicar | Inspecionar a draft PR vinculada à issue | Diff e CI no SHA publicado |
| Revisar/corrigir | Ler pareceres; acompanhar o ciclo somente quando autorizado | Parecer por SHA, tentativas e commits de correção |
| Avaliar | Reproduzir achados relevantes e registrar a triagem | Critérios atendidos e decisão justificada |
| Integrar | Mantenedor marca pronta, confere as regras da branch e decide o merge | Commit integrado e CI da base |

Adicionar somente uma label não inicia o agente. Cada novo comentário de implementação
pode gerar nova execução e consumo. O [fluxo detalhado](fluxo-issue-ate-pr.md) e o
[guia do ciclo](engineering-loop.md) contêm os comandos e os procedimentos de diagnóstico.

## Como operar o corretor opcional

Comece o piloto com implementação e revisão consultiva. Autorize correções em uma tarefa
adequada depois de conferir o funcionamento do pipeline e o orçamento disponível. O fluxo
exige `AI_ENABLED`, `AI_REVIEW_ENABLED` e `AI_LOOP_ENABLED` ativos, mais `ai:autofix` na PR.
Quando essa label está na issue autorizada, o publisher a transfere para a draft PR.

O ciclo tem até duas correções por PR. Ele aguarda CI do SHA revisado, reserva a tentativa,
gera o patch e executa os testes antes de um novo push. Falhas/cancelamentos preservam a
reserva. Achados P0, falha de validação ou falta de limites disponíveis exigem intervenção.
O comentário de acompanhamento registra `active`, `awaiting-review`, `ready-for-human`
ou `needs-human`; os estados não aprovam a PR.

O [teste real da PR #32](validacao-engineering-loop.md) publicou duas correções, mas terminou
em `needs-human` com falsos positivos na última revisão. O limite impediu novas tentativas;
a triagem assistida e a CI aprovada sustentaram a decisão de integração autorizada.
Esse é um exemplo de intervenção prevista no processo, não de encerramento autônomo.

## Triagem dos achados

Leia cada achado no código completo e no contrato, considerando o SHA analisado:

| Situação | Ação esperada |
|---|---|
| Defeito reproduzível no contrato atual | Acrescentar/reproduzir uma regressão; corrigir e validar o novo commit |
| Contexto omitido pelo revisor | Mostrar o método/contrato existente e registrar por que o achado não se aplica |
| Mudança futura hipotética | Registrar como não acionável no escopo atual; propor tarefa futura somente por decisão explícita da equipe |
| Parecer de SHA antigo | Conferir a versão atual; obter revisão atualizada quando necessária |
| `needs-human` ou limite atingido | Inspecionar execução, custos e tentativas; avaliar correção manual e decisão de entrega |

Use este registro na descrição/conversa da PR:

```text
SHA avaliado:
Execução e identificador do achado:
Classificação: confirmado / não acionável / precisa de investigação
Evidência: teste, contrato ou trecho de código que sustenta a conclusão
Ação e responsável:
```

Registre também a decisão pelo comando `/ai-triage` do [guia de triagem](review-triage.md).
Ele exige escrita, SHA e revisão atuais, identificador e justificativa; publica um recibo
sem alterar o envelope do bot nem o histórico das tentativas. Achados confirmados ou em
investigação mantêm `AI review gate` bloqueado. Para interromper novas correções, remova `ai:autofix` e cancele execuções já
iniciadas. Recolocar a label não zera tentativas nem retoma automaticamente um ciclo parado.
Uma nova revisão sem achados com CI aprovada pode registrar `ready-for-human` preservando
o histórico. Os demais casos exigem avaliação deliberada do mantenedor.

## Quando uma entrega está concluída

- Critérios da issue atendidos e contrato documentado quando o comportamento público muda.
- Testes de regressão relevantes aprovados e CI correspondente ao commit atual.
- PostgreSQL/Docker e critérios HTTP verificados quando exigidos pelo perfil.
- Diff inspecionado, achados avaliados e limitações não verificadas declaradas na PR.
- Consumo conhecido/indisponível registrado, junto das tentativas consumidas.
- Aprovação e merge decididos conforme a política da equipe; depois, CI da base conferida.

`ready-for-human` é uma entrada para essa avaliação. `needs-human` exige triagem e
reconhecimento explícito da parada. O workflow pode ficar verde ao registrar uma parada;
`AI review gate` é o check separado que reflete a liberação do commit. Configure-o como
obrigatório na proteção de branch. CI verde e um comentário da IA, isoladamente, não
satisfazem esse acordo de entrega.

## Adotar em outro repositório

1. Escolher um mantenedor, um serviço de laboratório e tarefas pequenas com dados sintéticos.
2. Copiar/forkar uma revisão conhecida e registrar a origem. Em 21/10/2026 este repositório
   ainda não está marcado como template no GitHub; bootstrap e atualização entre projetos
   são propostas do roadmap.
3. Adaptar comandos, caminhos permitidos, contrato e critérios de aceitação ao serviço.
   Os scripts atuais conhecem `apps/catalog-api`, Java e seus testes HTTP.
4. Configurar, no repositório de destino, proteção da branch, permissões, labels, variáveis
   e o secret do provedor autorizado. A cópia dos arquivos não valida essas configurações.
5. Rodar a CI sem IA; depois validar implementação e revisão com uma tarefa nova.
6. Autorizar o corretor em uma tarefa controlada e conferir também o caminho de parada.
7. Registrar resultados por tarefa e revisar o piloto antes de ampliar o uso.

Guarde issue, PR, SHAs, execuções, resultado dos testes, achados confirmados/descartados,
intervenções e consumo estimado. Artefatos de Actions expiram após 14 dias neste projeto;
uma política de evidências duráveis precisa definir armazenamento e responsável.

Os controles existentes e os pontos que dependem da organização estão em
[governança](governance.md). As melhorias sugeridas, com ordem e critérios de aceite,
estão no [roadmap](roadmap.md).
