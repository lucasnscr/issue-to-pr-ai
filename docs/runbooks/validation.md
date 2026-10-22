# Validar a referência

## Matriz de verificações

| Camada | Comando/evidência | O que comprova |
|---|---|---|
| Estrutura e links | `node scripts/validate-docs.mjs` | Targets locais e âncoras Markdown existem; exemplos em fences não são links executáveis |
| Configuração local | `make doctor` | Caminhos e catálogo legíveis, sem consulta ao GitHub |
| Ferramentas | `node scripts/repository-doctor.mjs --tools` | Versões e Docker disponíveis, sem inferência de testes aprovados |
| Scripts de controle | `node --test scripts/tests/*.test.cjs` | Regras, autorizações, falhas, limites e contratos simulados |
| Skills | `node scripts/validate-skills.cjs` | Recursos/originais/licenças fixados e hashes coerentes |
| Configuração | `.venv/bin/python scripts/validate_config.py` | YAML/POM, formulários e invariantes dos workflows/agentes |
| Java e banco | `make test` | Unidade e integração HTTP com PostgreSQL real/Testcontainers |
| Aplicação empacotada | CI / `make acceptance` com Compose iniciado | Smoke e contratos HTTP contra a aplicação em execução |
| Graphify real | CI | CLI fixada e extração AST sem backend de modelo |
| GitHub | Doctor `--github` e checks do SHA | Configuração e execução reais, com alcances diferentes |
| Provedor | Workflow real com artefato de uso | Conectividade, modelo e publicação da execução específica |
| Kubernetes CPU | `kubernetes.yml` | API/PostgreSQL em kind e persistência verificada |

## Sequência local

```sh
make setup
make verify
docker compose up --build -d
make acceptance
```

`make acceptance` chama os scripts HTTP existentes e usa `BASE_URL` quando definido.
Ele exige uma aplicação de laboratório em execução e dados sintéticos; não inicia/destrói
containers nem se apresenta como isolamento de ambiente. Os testes Java criam seus próprios
containers. Falha por Docker indisponível deve ser resolvida, não convertida em teste ignorado.

CI executa tudo em runners próprios, acrescenta imagem Docker/HTTP e preserva relatórios.
Alterações em scripts precisam dos testes correspondentes. Alterações reversíveis de
documentação precisam de links, coerência e evidência apropriada, sem testes artificiais.

## Evidências por entrega

Na PR registre critério, SHA, comando/workflow, resultado e limitações. Para IA acrescente
modelo, manifesto das skills, tokens/estimativa e tentativas. Artefatos expiram em 14 dias;
registre no relatório versionado somente agregados e links públicos apropriados, sem chaves,
prompts sensíveis, logs brutos ou arquivos gerados de build.

Não há uma garantia universal de “100% funcional” para qualquer ambiente/provedor. A
declaração útil é quais cenários passaram em qual commit. Campos `pass` do doctor não
substituem testes; revisão por IA não substitui a decisão de entrega. A
[validação desta evolução](../validacao-reference-method.md) registra o alcance observado.
