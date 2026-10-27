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

## Resultados sem entrega

O workflow de sincronização usa a branch padrão confiável para acompanhar CI bem-sucedida/reprovada/cancelada, implementação autorizada interrompida e PR fechada sem merge. Não faz checkout do candidato nem lê artefatos com o segredo de callback. `pull_request_target` é usado apenas para ler metadados atuais de encerramento; forks e SHAs antigos são recusados. O implementador não recebe esse segredo.

CI nova pode recuperar a mesma PR; eventos antigos não substituem o resultado mais recente. PR encerrada sem merge cancela a tentativa. Casos sem atividade são escalados pelo Sentinela e exigem decisão do mantenedor; entregas sem recibo ficam incertas até conferência do provedor. Isso não autoriza outro deploy nem repete rollback. Todos os recursos continuam desabilitados por padrão.

## Aprendizado revisado e executável

Depois da recuperação verificada, prepare e aprove uma versão no painel Sentinela. Responsável/revisor são declarações autorizadas pelo token de operação. O runbook aprovado entra no catálogo; regressão e avaliação são geradas no checkout deste repositório:

```sh
# Ambiente de controle: callback token somente nesta etapa, sem executar código candidato.
node scripts/sentinela/learning.mjs fetch CASO VERSAO /tmp/aprendizado-aprovado.json
# Checkout deve conter o commit verificado; use uma branch dedicada.
# Remova o callback token do ambiente antes de gerar e executar Maven.
unset SENTINELA_CALLBACK_TOKEN
node scripts/sentinela/learning.mjs generate /tmp/aprendizado-aprovado.json lucasnscr/issue-to-pr-ai
./mvnw -B -ntp verify
node scripts/sentinela/learning.mjs evaluate evaluations/incidents/CASO/v1.json /tmp/resposta-diagnostico.json
```

`fetch` usa `SENTINELA_URL`, `SENTINELA_CALLBACK_TOKEN` e `GITHUB_REPOSITORY`. O arquivo local é criado com modo 0600; exporte apenas dados revisados e sintéticos. `generate` produz teste Java com PostgreSQL real, fixture JSON, runbook, caso de avaliação e manifesto com hashes/proveniência. Nenhum texto do incidente vira código ou comando. O perfil inicial cobre o catálogo Java; novos perfis exigem implementação e validação. Reenvio idêntico preserva arquivos, conflito exige nova versão aprovada. O hash confirma integridade, não autentica um arquivo obtido por canal externo.

A avaliação independente de provedor verifica ação, palavras esperadas na causa e citações de evidências em `hypotheses[].supportingEvidence`; não é medida universal de qualidade do modelo. Resposta incorreta retorna exit code 1. Versione os artefatos gerados em PR e valide o teste na fonte defeituosa e corrigida. O teste conjunto do Sentinela faz isso com HTTP 503 e PostgreSQL reais; a revisão/CI de mudanças continuam obrigatórias. A geração não concede merge nem dispara agente. Ao reutilizar export histórico, confira se o caso continua verificado e a versão aprovada é atual.

A aprovação também encaminha automaticamente uma issue `sentinela-learning/v1`, sem `ai:ready`. Habilite `SENTINELA_LEARNING_ENABLED=true` apenas depois de configurar o callback/receptor. O workflow `sentinela-learning.yml` busca a versão aprovada pelo canal autenticado, gera e valida Maven em job sem callback, e regenera o mesmo conjunto em publisher separado para abrir PR draft e disparar CI. O artefato aprovado expira em sete dias e representa a revisão histórica no início da execução. Reexecute o workflow para retomar; branch remota existente sem PR exige conferência, sem force push. O produto não aprova ou integra a PR.

## Resultado de negócio e janela estável

O receptor admite políticas por serviço/ambiente com probes GET de negócio, assertions de dados e estabilidade temporal, ligadas à proposta por hash. Consulte o exemplo `examples/issue-to-pr-ai/recovery-policy.json` no Sentinela e configure o prazo de verificação antes de publicar a proposta. HTTP 200 com dados incorretos não confirma recuperação. Rollback possui sequência e critérios próprios (`rollbackProbes`, ou os mesmos probes quando omitidos).

`SENTINELA_VERIFY_TIMEOUT_MS` controla a espera do publisher, de 10000 a 660000 ms, com padrão de 11 minutos. O valor deve exceder `SDLC_VERIFY_TIMEOUT_MS` do receptor (máximo de 10 minutos), considerando consulta e transporte. O workflow permite 30 minutos para rollout, verificação e reversão. Configuração inválida é recusada antes de qualquer mutação. Mudança de política durante a entrega exige revisão e pode levar a rollback/escalonamento; o publisher não ignora o resultado para liberar o deploy.

A verificação observa tráfego Prometheus e operações de leitura definidas pelo administrador. A janela é medida por observações novas; repetições, lacunas ou dados incorretos não avançam o critério. Outros runtimes podem fornecer os mesmos probes HTTPS e recibos; a entrega incluída continua sendo o adaptador Kubernetes.
