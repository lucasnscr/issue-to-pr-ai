# Kubernetes: catálogo, inferência e runners

Este perfil é opcional. Configure primeiro o [fluxo gerenciado](setup-cloud.md).
Os manifestos podem ser renderizados com `kubectl kustomize` sem conectar a um cluster.
Aplicá-los exige um cluster escolhido por você; este repositório não provisiona máquinas ou GPUs.
O catálogo já foi executado em Kubernetes local; a evidência e os limites estão em
[kubernetes-verification.md](kubernetes-verification.md).

## Teste local completo e reproduzível

Com Docker, Node.js 22+, kubectl e kind v0.30.0 instalados:

```sh
export KUBECONFIG="${TMPDIR:-/tmp}/issue-to-pr-ai-demo.kubeconfig"
node scripts/k8s-acceptance.mjs --deploy
```

O script cria ou reutiliza **somente** o cluster local `issue-to-pr-ai-demo`, usa
Kubernetes v1.34.0 com imagem fixada por digest e seleciona explicitamente o contexto
`kind-issue-to-pr-ai-demo` em cada chamada. Não utiliza o contexto corrente.
Ele constrói/carrega a imagem, cria um secret aleatório sem gravar sua chave em arquivo,
aplica PostgreSQL/API e testa CRUD, validação, filtro, paginação e persistência após
reiniciar os Pods da API e do PostgreSQL. O teste confirma a troca do Pod do banco
e a preservação do registro no PVC. Os produtos sintéticos são removidos ao concluir.
O secret existente é preservado para manter a senha compatível com o PVC.

`KIND_BIN` permite informar o caminho do binário kind; `K8S_DEMO_PORT` altera a porta
local padrão 18080. O cluster permanece disponível para demonstração:

```sh
kubectl --context kind-issue-to-pr-ai-demo -n catalog port-forward service/catalog-api 18080:8080
# Ao terminar a demonstração, exclua o cluster e seu volume de laboratório:
kind delete cluster --name issue-to-pr-ai-demo
```

A workflow **Kubernetes acceptance** também executa o teste completo sob demanda
e em PRs que alterem os manifestos da aplicação ou o próprio teste. O cluster da CI
é sempre removido ao fim da execução.

## Catálogo

Requisitos: Kubernetes com StorageClass padrão, `kubectl`, imagem da API acessível aos nós.
Em kind, por exemplo, faça build e carregue a imagem no cluster:

```sh
docker build -t catalog-api:0.1.0 .
kind load docker-image catalog-api:0.1.0
kubectl create namespace catalog --dry-run=client -o yaml | kubectl apply -f -
```

Crie fora do repositório um arquivo protegido com duas linhas `DATABASE_USER=...` e
`DATABASE_PASSWORD=...`. Depois crie o secret sem colocar os valores na linha de comando:

```sh
kubectl -n catalog create secret generic catalog-db \
  --from-env-file=/caminho/protegido/catalog-db.env \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -k infra/kubernetes/application
kubectl -n catalog rollout status deployment/catalog-api --timeout=240s
kubectl -n catalog port-forward service/catalog-api 8080:8080
```

Para registry remoto, ajuste a imagem em `application/api.yaml` e configure `imagePullSecrets`
se necessário. O PostgreSQL de demonstração usa PVC de 5 GiB; faça backup e escolha um banco
gerenciado/operador antes de levar este perfil a produção.

## Inferência privada com vLLM

O exemplo serve `Qwen/Qwen2.5-Coder-7B-Instruct`, com alias `qwen-coder` e contexto de 16 mil tokens.
Comece com GPU NVIDIA com pelo menos 24 GiB de VRAM e ajuste contexto, quantização e paralelismo
conforme a máquina. Esse dimensionamento é um ponto de partida, não um benchmark.
O nó precisa de driver e device plugin/GPU Operator; `nvidia.com/gpu` deve aparecer como recurso alocável.
Também são necessários 40 GiB de armazenamento e acesso ao Hugging Face para baixar os pesos.

Crie um arquivo protegido com `VLLM_API_KEY=...`, usando uma chave aleatória própria para esse servidor:

```sh
kubectl create namespace ai --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ai create secret generic vllm-auth \
  --from-env-file=/caminho/protegido/vllm.env \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -k infra/kubernetes/inference
kubectl -n ai rollout status deployment/vllm --timeout=1800s
```

A imagem e o parser de tool calling estão explícitos em `inference/vllm.yaml`.
Se trocar o modelo, ajuste o parser, recursos e limites no `opencode.json`.
Para pesos privados, crie também o secret Hugging Face e adicione sua referência ao Deployment.

O serviço `vllm.ai.svc.cluster.local:8000` é interno. A NetworkPolicy permite tráfego de entrada
somente do namespace `ai-runners`; isso depende de um CNI que implemente NetworkPolicy.
Não há Ingress público. A API exige a chave do secret `vllm-auth`.

## Runners temporários com Actions Runner Controller

O runner precisa alcançar o serviço privado e ter Docker disponível para Testcontainers.
O exemplo usa ARC com Docker-in-Docker. Instale o controller em namespace separado:

```sh
helm install arc \
  --namespace arc-systems --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller \
  --version 0.15.0
kubectl create namespace ai-runners --dry-run=client -o yaml | kubectl apply -f -
```

Crie `arc-github-auth` em `ai-runners` usando as credenciais do seu GitHub App
(`github_app_id`, `github_app_installation_id`, `github_app_private_key`), conforme o
[guia oficial de autenticação do ARC](https://docs.github.com/en/actions/how-tos/manage-runners/use-actions-runner-controller/authenticate-to-the-github-api).
Uma alternativa para laboratório é um secret com a chave `github_token`; não versione seu conteúdo.

Copie `infra/kubernetes/runners/values.example.yaml` para um arquivo fora do repositório e ajuste
`githubConfigUrl`. Os comandos fixam os charts 0.15.0, renderizados neste laboratório.
Em ambientes controlados, fixe também a imagem do runner e valide as versões no seu cluster.
O exemplo conserva a imagem oficial do runner para acompanhar sua compatibilidade
com o serviço GitHub.

```sh
helm install ai-kubernetes \
  --namespace ai-runners \
  --values /caminho/protegido/runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set \
  --version 0.15.0
```

O scale set sobe de zero até dois runners e descarta cada runner após o job. O modo DinD requer
permissão para o sidecar privilegiado no namespace. Use este grupo de runners para tarefas autorizadas
do repositório, em ambiente separado das suas aplicações de produção.

Configure no GitHub:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `AI_RUNNER` | `["ai-kubernetes"]` |
| Variable | `VLLM_BASE_URL` | `http://vllm.ai.svc.cluster.local:8000/v1` |
| Secret | `VLLM_API_KEY` | Mesma chave configurada em `vllm-auth` |
| Variable | `OPENCODE_MODEL` | `vllm/qwen-coder` |
| Variable | `REVIEW_MODEL` | `vllm/qwen-coder`, se quiser revisão também local |

`AI_ENABLED` e `AI_REVIEW_ENABLED` continuam controlando ativação.
O caminho `@claude` continua usando o modelo Anthropic e runner hospedado pelo GitHub.
A CI comum também continua nos runners hospedados; `AI_RUNNER` seleciona somente OpenCode e revisão.

Antes de acionar uma issue, execute o preflight do runner com `VLLM_BASE_URL` e
`VLLM_API_KEY` já injetados pelo ambiente protegido:

```sh
node scripts/k8s-acceptance.mjs --inference-preflight
```

O preflight exige rejeição de acesso sem chave (401/403), confirma o alias em
`/v1/models` e faz uma requisição **real** de tool calling, validando nome e argumentos
da função retornada pelo modelo. `VLLM_MODEL` permite mudar o alias padrão `qwen-coder`.
O relatório `artifacts/inference-preflight.json` não inclui a chave nem respostas brutas.
Essa verificação depende do seu cluster/GPU; renderizar YAML não confirma que o modelo
carregou ou que a inferência funciona. Execute também um job de teste no scale set e
verifique seu descarte antes de considerar ARC validado.

Referências: [ARC](https://docs.github.com/en/actions/how-tos/manage-runners/use-actions-runner-controller/deploy-runner-scale-sets),
[vLLM no Kubernetes](https://docs.vllm.ai/en/latest/deployment/k8s/) e
[tool calling](https://docs.vllm.ai/en/latest/features/tool_calling/).
