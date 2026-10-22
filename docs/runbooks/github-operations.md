# Operar os fluxos no GitHub

## Entrada e autorização

Funcionalidade e defeito têm formulários com critérios e skills. Manutenção do método,
workflows e infraestrutura tem caminho próprio de PR conduzida pelo mantenedor.
`type:*`, `area:*` e `status:*` organizam trabalho; não são autorização de IA.
Os formulários não atribuem `ai:ready` ou `ai:autofix`. CODEOWNERS identifica o responsável;
as condições de merge continuam definidas na proteção da branch.

| Ação | Entrada | Condições principais | Resultado |
|---|---|---|---|
| Especificar | Novo comentário `/ai-spec` em issue | Escrita, issue aberta, `AI_ENABLED` e `AI_SPEC_ENABLED` | Perguntas e critérios propostos, sem código/labels |
| Implementar | `/oc`, `/opencode` ou `@claude` em issue | Escrita, issue aberta, `ai:ready`, flags do agente | Patch validado e draft PR |
| Revisar | Evento autorizado de PR ou dispatch | Mesmo repo, flags de revisão, ator autorizado para dispatch | Parecer consultivo por SHA |
| Corrigir | Controlador após revisão confiável | CI atual, flags, `ai:autofix`, escopo e reserva | Até duas correções na mesma PR |
| Triar | `/ai-triage` com SHA/run/alvo/decisão | Escrita e referências atuais | Recibo rastreável, sem novas tentativas |
| Integrar | Decisão do mantenedor | PR pronta e checks atuais aprovados | Merge e CI da base |

Comandos só por novo comentário; editar comentário antigo não repete implementação.
Revisão é idempotente por SHA. Cada novo `/ai-spec` pode gerar consumo; inclua na rodada
as decisões e o contexto, pois o histórico inteiro não é fornecido.

## Inspecionar antes de acionar

```sh
node scripts/repository-doctor.mjs --github --repo OWNER/REPOSITORY --profile base
gh pr checks NUMERO
gh run list --limit 10
gh run view RUN_ID --json status,conclusion,jobs
```

Inspecione o SHA e o estado do ciclo. Workflow verde pode ter registrado `needs-human`.
O check `AI review gate` verifica a liberação do commit; um caminho manual verde não
significa inferência realizada. Nunca misture checks de um commit antigo com o diff atual.

## Acionamentos explícitos

```sh
# Revisão, inclusive draft, usando o controle da branch padrão
gh workflow run ai-review.yml --ref main -f pull_request=NUMERO

# Revalidar aplicação e scripts na branch escolhida
gh workflow run ci.yml --ref BRANCH

# Laboratório CPU de aplicação/banco, sem GPU
gh workflow run kubernetes.yml --ref BRANCH
```

O dispatch de revisão exige escrita e pode tornar a revisão uma obrigação persistente
para aquela PR. Não o use como uma checagem gratuita nem para contornar o limite de contexto.
Avaliação de qualidade tem workflow e limite próprios; veja [avaliação do revisor](../reviewer-evaluation.md).
O diagnóstico histórico `AI live test` continua desativado e não é o ponto de entrada atual.

## Resolver uma parada

| Sintoma | Conferir | Ação |
|---|---|---|
| Comando ignorado | Ator, prefixo, novo comentário, flags e tipo de issue | Corrigir a entrada/configuração; criar novo comentário autorizado |
| Doctor não consegue ler metadados | Acesso `gh`, repo e permissões | Resolver acesso; não tratar informação ausente como proteção aplicada |
| Skills recusadas | IDs, seção exata, quantidade, fase e hashes | Corrigir seleção; alteração de conteúdo aprovado segue PR própria |
| Graphify falhou | CLI fixada, checkout limpo, limites e origem | Resolver preparação; não remover a skill silenciosamente para alegar equivalência |
| Inferência falhou | Política e diagnóstico sanitizado | Conferir credencial/modelo/acesso sem publicar valores; uso ausente não é zero |
| CI/testes falharam | SHA, relatório e primeira falha concreta | Corrigir causa e revalidar; não enfraquecer asserções/controles |
| Parecer especulativo | Código completo, contrato, base e entradas | Triagem com evidência, conforme o guia |
| Ciclo parou | Tentativas, reserva, P0 e `needs-human` | Intervenção/triagem; recolocar labels não zera o histórico |
| Merge bloqueado | Checks, SHA/base, conversas, proteção | Resolver a pendência; não usar bypass administrativo |

Veja [triagem](../review-triage.md), [engineering loop](../engineering-loop.md) e
[segurança](../../SECURITY.md). A configuração de origem e o bootstrap estão no
[guia de adoção](adoption.md).
