# Verificação local

Verificado em 20 de outubro de 2026, com Java 21 e Docker Desktop:

| Verificação | Resultado |
|---|---|
| `./mvnw -B -ntp verify` | 2 testes unitários + 17 testes HTTP/PostgreSQL, todos aprovados |
| `node --test scripts/tests/*.test.cjs` | 9 testes de autorização, integridade de patch e publicação de revisão, todos aprovados |
| `docker build -t catalog-api:0.1.0 .` | Build multi-stage aprovado; processo final usa UID/GID 10001 |
| Compose + `scripts/smoke.mjs` | Readiness, criação, consulta, exclusão e OpenAPI aprovados |
| actionlint 1.7.12 | Workflows válidos |
| `make check` | YAML, POMs, invariantes do agente, Compose e renderização Kustomize aprovados |
| OpenCode CLI 1.19.3 + `scripts/run-review.mjs` | Revisão gerada usando um endpoint local simulado compatível com a API vLLM |

Os testes HTTP usam PostgreSQL real em container, incluindo migration Flyway e rollback de atualização
com SKU duplicado. O teste do revisor confirmou instalação da CLI, leitura do anexo, configuração
do provider e extração do texto JSON; ele não mede qualidade de um modelo real.

Não foram executadas chamadas a modelos pagos, Actions no GitHub, publicação de repositório,
instalação de ARC nem inferência em GPU. Essas etapas dependem da configuração descrita em
[GitHub](setup-cloud.md) e [Kubernetes](setup-kubernetes.md). Os manifestos foram renderizados,
sem aplicar mudanças em um cluster.
