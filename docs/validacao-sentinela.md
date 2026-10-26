# Validação da integração com Sentinela

Executada em 26 de outubro de 2026 nos dois checkouts.

- `./mvnw -B -ntp verify`: build aprovado, com dois testes unitários e 82 de integração do catálogo em PostgreSQL real.
- Scripts de autorização, agentes, contratos, entrega e hooks executados com Node; o resultado final está registrado na CI do commit.
- `make check`: catálogo, links, doctor, configuração, Compose e manifests aprovados.
- Workflows novos e alterados validados com actionlint.
- O hook também recusou um commit Git real de teste com arquivo staged de 20.001 bytes. O limite exato, UTF-8, conteúdo do índice e exceções foram exercitados.

O teste integrado no Sentinela implantou uma regressão HTTP 503 em uma cópia temporária deste catálogo, com PostgreSQL e Prometheus reais. O worker detectou o incidente, preparou a proposta e publicou uma única issue no GitHub controlado, sem label de autorização.

Os gates existentes recusaram o início sem ai:ready e prepararam a tarefa após autorização simulada de mantenedor. O wrapper governado recebeu uma resposta de agente controlada. Um teste PostgreSQL de regressão falhou antes da correção; após a alteração, Maven completo passou e a imagem corrigida foi construída.

O teste vinculou PR/CI, recusou entrega antes do merge simulado, substituiu o container e confirmou três novas amostras saudáveis para o SHA/digest/deploy esperados. Uma segunda entrega intencionalmente defeituosa falhou na verificação, acionou rollback uma vez e permaneceu sem estado verificado.

GitHub, resposta do agente e decisão de merge foram controlados. Não houve inferência comercial, merge real, publicação de imagem em registry remoto nem alteração de cluster de produção. O adaptador Kubernetes e suas precondições têm testes de contrato; a substituição de artefatos no teste integrado usa Docker local. O relatório gerado fica no checkout Sentinela, fora do Git, em `test-results/sdlc-integration-report.json`.
