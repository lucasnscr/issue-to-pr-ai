# Documentação do método

O Issue to PR AI é uma referência executável de trabalho com IA. A aplicação Java é o
laboratório; o método organiza requisitos, skills, autorização, geração, validação,
revisão, correção limitada e decisão de entrega. Comece por uma jornada abaixo.

## Escolha sua jornada

| Quero… | Começar por | Depois consultar |
|---|---|---|
| Conhecer e executar o projeto | [Quickstart](quickstart.md) | [Aplicação](../apps/catalog-api/README.md), [validação](runbooks/validation.md) |
| Usar IA em uma tarefa | [Modelo de trabalho](modelo-de-trabalho.md) | [Fluxo issue → PR](fluxo-issue-ate-pr.md), [skills](skills-usage.md) |
| Configurar GitHub e adotar em outro repo | [Adoção e bootstrap](runbooks/adoption.md) | [Operação GitHub](runbooks/github-operations.md), [configuração](setup-cloud.md) |
| Entender por que a solução funciona assim | [Arquitetura](architecture.md) | [Decisões registradas](decisions/README.md), [governança](governance.md) |
| Avaliar ou corrigir um parecer | [Triagem](review-triage.md) | [Engineering loop](engineering-loop.md), [avaliação do revisor](reviewer-evaluation.md) |
| Resolver uma execução bloqueada | [Operação GitHub](runbooks/github-operations.md) | [Validação](runbooks/validation.md), [limites do ciclo](engineering-loop.md) |
| Conferir resultados reais | [Validação da referência](validacao-reference-method.md) | [Skills](validacao-skills.md), [loop](validacao-engineering-loop.md), [R1/R2](validacao-review-quality-triage.md) |

## Mapa da implementação

| Caminho | Responsabilidade | Como mudar |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `opencode.json` | Contrato e ferramentas dos agentes | Tarefa explícita, teste de limites e autorização |
| `apps/catalog-api/` | Produto de laboratório e testes HTTP/PostgreSQL | Preservar contrato e migrations aplicadas |
| `.github/workflows/` | Eventos, permissões e jobs | Conferir procedência, falhas e publicação isolada |
| `.github/scripts/` | Integração de comandos e metadados GitHub | Testes de autorização, SHA e idempotência |
| `.github/ISSUE_TEMPLATE/`, PR template, CODEOWNERS | Entrada de trabalho e responsabilidade | Sem conceder `ai:ready`/`ai:autofix` automaticamente |
| `scripts/` | Execução, validação, consumo e ferramentas de adoção | Node tests e verificação independente |
| `config/` | Políticas e configuração versionada | Preservar limites e distinguir desejado de aplicado |
| `skills/` | Adaptadores por fase, fontes e licenças fixadas | Validar hashes e avaliar o efeito no modelo |
| `evals/` | Casos e resultados esperados do revisor | Versionar dataset e proveniência |
| `infra/` | Kubernetes de aplicação, inferência e runners | Validar cada ambiente escolhido separadamente |
| `docs/decisions/` | Escolhas duradouras e consequências | Nova decisão quando o contrato arquitetural mudar |
| `docs/runbooks/` | Procedimentos operacionais e de adoção | Comandos reproduzíveis e limites explícitos |

O índice organiza a documentação sem mover guias existentes ou quebrar seus links.
Logs, `.env`, ambientes locais, relatórios e artefatos gerados não são fontes versionadas.

## Guias por assunto

- Método: [contribuir](../CONTRIBUTING.md), [papéis e critérios](modelo-de-trabalho.md),
  [fluxo completo](fluxo-issue-ate-pr.md), [decisões](decisions/README.md).
- Agentes: [catálogo de skills](skills-catalog.md), [manual individual](skills-usage.md),
  [OpenCode/Claude no GitHub](setup-cloud.md), [Cursor](cursor.md).
- Operação: [doctor e bootstrap](runbooks/adoption.md), [GitHub](runbooks/github-operations.md),
  [validação](runbooks/validation.md), [governança e consumo](governance.md), [segurança](../SECURITY.md).
- Infraestrutura: [Kubernetes](setup-kubernetes.md), [verificação local](kubernetes-verification.md).
- Evidências: [referência](validacao-reference-method.md), [skills](validacao-skills.md),
  [loop real](validacao-engineering-loop.md), [avaliação/triagem](validacao-review-quality-triage.md).
- Comunicação e evolução: [demonstração](demo.md), [casos de uso](use-cases.md),
  [apresentação](presentation/README.md), [roadmap](roadmap.md).

## Interpretar o estado do projeto

Uma CI verde comprova os checks daquele commit. Um doctor verde comprova somente os itens
de configuração inspecionados. Uma resposta de modelo é proposta sujeita a revisão.
Consulte os relatórios para saber o que foi realmente executado e o que permanece pendente;
não trate arquivos de GPU/vLLM/ARC ou a alternativa Cursor como implantação validada.

## Implementação com modelo local

- [Documento interativo do produto](product/index.html): fases, critérios e evidências. Sirva com `node scripts/serve-product-docs.mjs`.
- [Changelog da integração Ollama](changelogs/ollama-integration.md).
