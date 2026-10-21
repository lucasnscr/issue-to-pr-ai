# GitHub: issue, implementação e revisão

## Configuração

Os workflows devem estar na branch padrão. Configure os Repository secrets na interface do GitHub, sem compartilhar valores no chat ou no código.

| Tipo | Nome | Uso |
|---|---|---|
| Secret | `ANTHROPIC_API_KEY` | OpenCode/Claude Code com Anthropic |
| Variable | `AI_ENABLED` | `true` habilita comandos autorizados |
| Variable | `CLAUDE_ENABLED` | `true` habilita também `@claude` |
| Variable | `AI_REVIEW_ENABLED` | `true` habilita revisão consultiva |
| Variable | `OPENCODE_MODEL` | `anthropic/claude-sonnet-4-6` |
| Variable | `CLAUDE_MODEL` | `anthropic/claude-sonnet-4-6` |
| Variable | `REVIEW_MODEL` | `anthropic/claude-sonnet-4-6` |
| Variable | `AI_ACCEPTANCE_PROFILE` | `category` por padrão, `price` exige também critérios de faixa de preço |

Em Settings / Actions / General, permita criar pull requests usando GitHub Actions.
O publisher precisa de `contents:write`, `pull-requests:write`, `issues:write` e `actions:write`.
A etapa de inferência não recebe token GitHub no ambiente nem credenciais persistidas no checkout.
Nenhum PAT adicional é necessário. O publisher dispara CI e revisão explicitamente via workflow_dispatch.

## Implementação por comentário

1. Crie uma issue com tarefa pequena, escopo e critérios verificáveis.
2. Adicione a label `ai:ready`.
3. Um colaborador com escrita comenta `/oc implemente esta issue` ou `@claude implemente esta issue`.
4. O gate reconsulta ator, label, estado e SHA da branch padrão.
5. O modelo edita fonte/testes/docs e executa Maven. Não pode publicar nem integrar código.
6. Um validador independente rejeita mudanças fora do escopo, em HEAD e symlinks.
7. Maven com PostgreSQL real, Docker e testes HTTP validam a aplicação completa.
8. Um runner novo publica somente o patch aprovado em uma draft PR contra `main`.
9. CI e revisão consultiva começam explicitamente. Uma pessoa inspeciona os resultados e decide o merge.

O caminho atual usa `opencode run` ou `claude --bare -p`, com CLIs fixadas.
O comentário continua sendo o gatilho GitHub, mas a publicação não depende de `opencode github run` ou de uma decisão do modelo.
Comentários em PRs não iniciam implementação. Use uma nova issue para cada tarefa.

Os limites e a telemetria ficam em [governança](governance.md). O artefato contém resumo, consumo estimado,
patch candidato e relatórios. A versão validada contém também `implementation.patch`.
Falhas de teste bloqueiam a publicação. Não existe correção automática por comentários de revisão.

## Revisão real

Em PRs do próprio repositório com label `ai:ready`, marcar uma draft como pronta dispara revisão quando as variáveis estão ativas.
O publisher também pode solicitar revisão da draft por dispatch autorizado na branch padrão:

```sh
gh workflow run ai-review.yml --ref main -f pull_request=NUMERO
```

O modelo recebe apenas o patch completo, com ferramentas negadas. Não executa o código da PR.
A publicação verifica novamente o SHA e atualiza seu comentário para evitar duplicação.
Um commit que já possui revisão do bot não inicia outra inferência, inclusive ao sair de draft.
Patches binários, incompletos ou acima de 32 mil bytes exigem revisão humana.
O comentário da IA é consultivo e não representa aprovação.

## Inferência privada

Configure `AI_RUNNER`, `VLLM_BASE_URL`, `VLLM_API_KEY` e modelo `vllm/qwen-coder` conforme
[o perfil Kubernetes](setup-kubernetes.md). Atualize a allowlist em `config/ai-policy.json` antes de mudar modelos.
A existência de manifestos não comprova que GPU, modelo e runner estão operacionais.

## Cursor

[Cursor CLI e Cloud Agents](cursor.md) podem ocupar a etapa de geração. A chave Anthropic não autentica o Cursor.
Essa alternativa exige credencial e revisão de política próprias e não foi executada neste laboratório.

## Diagnóstico histórico

O workflow `AI live test` registra o experimento anterior ao primeiro merge, restrito ao filtro de categoria.
Ele exige `AI_LIVE_TEST_ENABLED=true`, `AI_LIVE_TEST_ISSUE` e `AI_LIVE_TEST_BASE_REF` com SHA idêntico ao da execução.
Mantenha-o desativado para a demonstração atual. O fluxo por comentário funciona agora a partir de `main`.

## Desativar chamadas

Defina `AI_ENABLED=false`, `AI_REVIEW_ENABLED=false`, `CLAUDE_ENABLED=false` e `AI_LIVE_TEST_ENABLED=false`.
Execuções já iniciadas precisam ser canceladas na aba Actions. Rotacione credenciais expostas no provedor e atualize o secret.
