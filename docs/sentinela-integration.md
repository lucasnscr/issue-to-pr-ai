# Integração de entrega e operação com Sentinela

O protocolo `contracts/sdlc-v1.mjs` vincula o fluxo deste repositório a um caso de correção no Sentinela. A implementação continua exigindo os gates do método: colaborador autorizado, issue aberta, `ai:ready`, validação independente, revisão e decisão humana de merge.

## Entrada: issue revisada

O Sentinela publica uma issue com incidente, serviço/ambiente, resumo revisado, evidências selecionadas e critérios. O marcador `sentinela-sdlc/v1` conserva case ID e hash da proposta. O marcador é dado de correlação, nunca autorização. A publicação não adiciona `ai:ready` nem inicia um agente.

O mantenedor revisa a issue e usa o fluxo normal. Configuração/infraestrutura permanente segue a manutenção conduzida pelo mantenedor; a integração não amplia os caminhos permitidos ao agente Java.

## Saída: CI da PR

Habilite `SENTINELA_ENABLED=true` nas variáveis do repositório e configure:

| Nome | Tipo | Papel |
| --- | --- | --- |
| `SENTINELA_URL` | Variável | Origem HTTPS da API; loopback HTTP serve somente para testes locais |
| `SENTINELA_SERVICE` | Variável | Serviço configurado no Sentinela, por exemplo catalog-api |
| `SENTINELA_ENVIRONMENT` | Variável | Ambiente explícito da instalação |
| `SENTINELA_CALLBACK_TOKEN` | Secret | Mesmo valor do SDLC_CALLBACK_TOKEN no Sentinela |

`sentinela-sync.yml` é acionado após a CI e executa código da branch padrão, sem candidato nem artefatos não confiáveis. A notificação exige CI aprovada, repositório de origem correto, PR aberta no SHA atual e exatamente uma issue vinculada. O token do callback fica no job confiável e não é passado ao agente. Issues comuns sem marcador não geram eventos.

## Entrega verificada

`sentinela-delivery.yml` é um piloto Kubernetes manual, desabilitado por padrão. Para ativá-lo:

1. Configure e proteja o environment GitHub `sentinela-delivery`, com aprovação do mantenedor e acesso ao cluster/registry necessários.
2. Configure nele as variáveis acima e `SENTINELA_KUBE_CONTEXT`, `SENTINELA_KUBE_NAMESPACE`, `SENTINELA_KUBE_DEPLOYMENT`, `SENTINELA_KUBE_CONTAINER`.
3. Provisione `SENTINELA_KUBE_CONFIG_B64` e o callback token como secrets desse environment. Restrinja a identidade Kubernetes ao Deployment autorizado.
4. Prepare o Deployment e PostgreSQL. Use imagem anterior fixada por digest e credenciais de pull adequadas para permitir rollback.
5. Configure `SENTINELA_DELIVERY_ENABLED=true` no repositório. Execute o workflow na branch padrão, informando a PR corretiva já integrada.

O primeiro job executa Maven com PostgreSQL e publica a imagem no GHCR. O segundo job, separado e protegido pelo environment, verifica que o commit contém o merge decidido pelo mantenedor e aplica a imagem por digest. UID, resourceVersion e imagem esperada protegem contra alteração concorrente do alvo. O workflow não cria cluster, Deployment, credenciais ou permissões.

Após o rollout, o pipeline informa o deploy e consulta o resultado no Sentinela. São necessárias três novas amostras saudáveis e com tráfego. A consulta confere caso, repositório, issue, PR, SHA, artefato e deploy; um resultado de outra mudança não libera a entrega. Ausência de confirmação ou timeout tenta rollback para a imagem anterior; resultado incerto exige intervenção. Merge/issue fechada não são prova de recuperação.

Antes de `deployment.started`, a entrega reconcilia `implementation.published` usando o head da PR já integrada. Assim, um callback pós-CI perdido ou atrasado não bloqueia o caso indefinidamente. O SHA implantado é conferido por ancestralidade e pode diferir do head da PR. Reenvios do mesmo evento não duplicam a vinculação. O callback de rollback da mesma entrega revoga eventual verificação anterior, inclusive se a resposta de conclusão se perdeu.

O catálogo agora fornece `/actuator/prometheus` com label `service=catalog-api` e histogramas HTTP. Proteja a rede de métricas na implantação. Configure Prometheus e as recording rules do Sentinela; o endpoint de health não substitui a medição do comportamento de negócio.

Configure `DEPLOYMENT_ENVIRONMENT` no Deployment, com o mesmo ambiente de `SENTINELA_ENVIRONMENT`. O valor padrão do catálogo é `local`. As regras atualizadas preservam `environment` e fornecem `sentinela_service_observed_at_seconds` a partir da hora real do scrape, condicionada a `up == 1`. Dados de outro ambiente, futuros, antigos ou sem novas observações não comprovam recuperação. Configure intervalos de scrape/evaluation menores que a janela de frescor de 20 segundos; o exemplo usa cinco segundos.

## Contrato e teste conjunto

O contrato compartilhado deve permanecer byte a byte idêntico nos dois repositórios; versões incompatíveis exigem outro protocolo. Reenvios são idempotentes e eventos fora de ordem ou com identidade divergente são recusados.

O teste completo é executado no checkout Sentinela:

Consulte os [resultados e limites da validação](validacao-sentinela.md).
Consulte também a [auditoria de callbacks e telemetria](validacao-auditoria-sdlc.md).

```sh
ISSUE_TO_PR_AI_DIR=/caminho/issue-to-pr-ai npm run test:e2e:sdlc
```

Ele usa este código Java, os gates de autorização, o wrapper governado e os validadores reais, com PostgreSQL e testes HTTP. GitHub, resposta do agente e decisão de merge são controlados; não chama provedor comercial nem publica issues de teste. Uma regressão precisa falhar antes da correção e passar depois. O teste também exercita uma entrega defeituosa e rollback. Os recursos são isolados e removidos no final.

Azure Functions já possui observação e ajustes no Sentinela; o adaptador de entrega deste piloto é Kubernetes. Outros destinos podem implementar as mesmas entradas/recibos, preservando os gates e os digests. A integração completa requer configurar e validar suas identidades, conectividade e políticas no ambiente escolhido.

## Fase 1: confirmar a recuperação após rollback

O recibo `deployment.rolled_back` confirma a execução e inicia `rollback_verifying`. O pipeline aguarda três novas observações saudáveis posteriores à reversão, com ambiente e identidade conferidos. `rolled_back` significa saúde recuperada, mantendo a correção permanente pendente. Timeout resulta em `rollback_failed`, com escalonamento para intervenção; o pipeline retorna erro sem repetir a reversão. Falha no próprio comando é enviada por `deployment.rollback_failed`. Atualize o receptor Sentinela antes de habilitar este publisher.

## Fase 2: tentativa atual e início novo

O Sentinela permite tentativas sucessivas revisadas para o mesmo incidente, com novas issues/PRs e limite por política. O publisher exige que o recibo de início indique o caso correto, estado deploying, tentativa atual e evento não repetido antes de qualquer mutação. Reenvios e tentativas substituídas exigem conferência, preservando o histórico e impedindo outro deploy. Atualize o receptor antes do publisher.
