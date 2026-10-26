# Auditoria da integração SDLC

Auditoria de 26 de outubro de 2026, referente à issue #53. A integração anterior foi incorporada pela PR #52; esta revisão testa falhas de sequência e de telemetria antes de comunicar o alcance do ciclo.

## Correções

- A entrega autorizada reconcilia a vinculação da PR antes de iniciar, recuperando callback pós-CI perdido antes do merge. Conserva separadamente o SHA do head e o commit integrado.
- O catálogo exporta a label `environment`, configurada por `DEPLOYMENT_ENVIRONMENT`, para a seleção de métricas no Sentinela.
- A outra metade da correção, no Sentinela, preserva a hora do scrape, rejeita observações futuras/antigas/de outro ambiente, respeita o prazo e revoga a verificação quando recebe rollback da mesma entrega.

## Evidências e alcance

O teste de reconciliação falhou antes da correção e passou depois. Os scripts, contratos e hooks totalizam 179 testes aprovados. `./mvnw -B -ntp verify` passou com dois testes unitários e 82 de integração PostgreSQL; `make check` também passou.

O teste conjunto fica no Sentinela (`npm run test:e2e:sdlc`) e usa o checkout deste repositório. Exercita regressão HTTP 503, teste vermelho/verde, wrapper governado, deploy corretivo, SHA de merge distinto do head, perda do callback pré-merge, rollback e métricas saudáveis congeladas. O relatório agregado e os resultados exatos ficam na CI do Sentinela; sua execução local/CI deve ser conferida para o par de commits escolhido.

Aplicação, bancos, Prometheus, worker, MCP, Maven e substituição de containers são reais. GitHub, resposta do modelo, aprovação de merge e congelamento das respostas de telemetria são controlados. O piloto de entrega Kubernetes tem testes de contrato; esta auditoria não certifica cluster de produção ou assinatura Azure.

## Leitura do processo

O [playbook da Anthropic](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) orienta o encadeamento das etapas por artefatos e decisões. O [ADLC da LangChain](https://www.langchain.com/blog/the-agent-development-lifecycle) acrescenta a avaliação do comportamento do próprio agente. A [discussão da Endor Labs](https://www.endorlabs.com/learn/what-is-the-ai-native-sdlc) reforça a análise das ações e dependências introduzidas pelos agentes. Aplicamos essas referências como critérios de auditoria, sem tratar os textos como certificações desta implementação.

Há autonomia supervisionada: o monitor detecta e investiga; o mantenedor revisa a proposta, autoriza implementação, decide merge e controla o environment de entrega. Avaliação contínua com dados reais de incidentes, metas universais de qualidade de modelos, SBOM/atestação de release e testes de todos os destinos são evoluções ainda dependentes de implementação e validação próprias. A CI verde não substitui esses controles.
