# Evidência de execução em Kubernetes

Em 21/10/2026 o catálogo completo foi executado em um cluster **kind local real**,
com Docker Desktop Linux arm64, kind v0.30.0 e Kubernetes v1.34.0.
O cluster foi criado exclusivamente para o laboratório, sem acessar um cluster corporativo.

O comando `scripts/k8s-acceptance.mjs --deploy` construiu a imagem da aplicação,
carregou-a no nó, gerou credenciais aleatórias do banco em memória e aplicou os
manifestos de `infra/kubernetes/application`. O banco usou um PVC e a API executou
com usuário não-root, filesystem somente leitura e probes de saúde.

Critérios verificados por HTTP através de `kubectl port-forward` do Service:

- Readiness, saúde incluindo PostgreSQL e documento OpenAPI.
- Criação e leitura de produtos, preservando o preço decimal.
- SKU duplicado com resposta 409 e preço inválido com ProblemDetail 400.
- Filtro de categoria sem distinção de caixa e com espaços normalizados.
- Paginação, totais, resultado vazio e parâmetros inválidos com resposta 400.
- Alteração de produto e persistência após substituição do Pod da aplicação.
- Exclusão, busca posterior com resposta 404 e limpeza dos dados sintéticos.

O relatório de cada execução fica em `artifacts/kubernetes-acceptance.json`,
ignorado pelo Git. Ele registra commit, ID da imagem, versão do Kubernetes,
duração, critérios e estado dos Pods; não inclui credenciais.
A workflow **Kubernetes acceptance** repete o procedimento em um cluster descartável
do runner hospedado pelo GitHub e publica somente esse relatório.

## Limites da evidência

| Componente | Verificação realizada | O que ainda exige ambiente escolhido |
|---|---|---|
| API + PostgreSQL | Deploy real, PVC, probes e aceitação HTTP | HA, backups, recuperação de desastre e dimensionamento |
| vLLM | Kustomize renderizado; preflight de autenticação e tool calling disponível | GPU NVIDIA, download dos pesos e inferência real |
| ARC | Charts oficiais 0.15.0 renderizados com Helm 3.19.0; controller e scale set | Instalação, GitHub App e execução de um job no runner |
| NetworkPolicy | Manifesto renderizado | CNI que implemente a política e teste de isolamento |

O nó local não anuncia `nvidia.com/gpu`. Não foi iniciado um contêiner vLLM,
não foram provisionadas GPUs e não foi cadastrado runner no GitHub.
Renderização de Helm/Kustomize não comprova funcionamento desses componentes.
O CNI padrão do kind não deve ser usado como evidência de enforcement de NetworkPolicy.

Para repetir o teste e verificar a inferência privada, veja [setup-kubernetes.md](setup-kubernetes.md).
