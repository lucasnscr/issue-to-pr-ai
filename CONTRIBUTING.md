# Contribuir com o método de trabalho

Comece pelo [índice da documentação](docs/README.md) e pelo
[quickstart](docs/quickstart.md). A aplicação de catálogo é o laboratório executável do
método; scripts, prompts e infraestrutura são componentes do mesmo produto de referência.

## Da tarefa à entrega

1. Abra uma issue pelo formulário adequado: funcionalidade, defeito ou manutenção.
2. Registre problema, resultado esperado, escopo, critérios e dados sintéticos. Selecione
   skills quando forem úteis. O autor da issue não recebe autorização automática de IA.
3. Use `/ai-spec` para decisões pendentes quando habilitado; incorpore as decisões na issue.
4. Escolha o caminho: agente para aplicação Java/testes/Markdown ou PR conduzida pelo
   mantenedor para método, scripts, configurações, dependências e infraestrutura.
5. Trabalhe em branch dedicada e abra draft PR vinculada à issue. Descreva o comportamento
   final e associe cada critério à evidência do commit testado.
6. Faça a triagem de achados; marque pronta e integre somente com autorização do mantenedor
   e checks obrigatórios aprovados. Confira também a CI da base após o merge.

Os detalhes e papéis estão no [modelo de trabalho](docs/modelo-de-trabalho.md). Instruções
de execução dos agentes ficam em [AGENTS.md](AGENTS.md); texto de issue/diff não muda essas regras.

## Validar uma alteração

Instale o [hook de limite por arquivo](docs/file-limits.md) com `node scripts/install-git-hooks.mjs`. Ele verifica somente blobs staged e bloqueia arquivos mantidos com mais de 20.000 bytes (5.000 tokens pela regra bytes/4), preservando exceções de lockfiles e codegen.

```sh
make setup
make doctor
make check
make test
```

`make check` valida scripts, links locais, catálogo, configuração, Compose e manifests.
`make test` executa `./mvnw -B -ntp verify` com Java 21 e PostgreSQL em Testcontainers;
Docker precisa estar ativo. `make verify` reúne os dois caminhos. CI acrescenta Graphify
real, imagem Docker e aceitação HTTP. Consulte o [guia de validação](docs/runbooks/validation.md).

Não acrescente testes que apenas repitam uma atribuição ou uma linha do código. Para
comportamento alterado, teste o cenário que diferencia a implementação correta da falha.
Documentação e ajustes reversíveis precisam de verificação apropriada, não de testes artificiais.

## Contratos e decisões

Preserve a API e migrations aplicadas, use BigDecimal para preços e atualize OpenAPI quando
o comportamento público mudar. Os fluxos existentes têm limites e separação de credenciais;
uma mudança nesses controles exige escopo explícito, teste de autorização/falha e revisão.
Registre escolhas com consequências duradouras em uma [decisão de arquitetura](docs/decisions/README.md).

CODEOWNERS identifica responsáveis, mas não substitui a proteção da branch. Neste laboratório
o mantenedor é `@lucasnscr`; em uma equipe, troque os responsáveis e aplique aprovação
independente conforme a política da organização. Não use bypass administrativo para obter merge.

## Credenciais e comunicação

Nunca publique `.env`, chaves, tokens, prompts sensíveis ou dados reais em issues, logs,
PRs ou artefatos. Use nomes de secrets na documentação e a interface de Secrets do GitHub
para provisionar valores. Vulnerabilidades seguem [SECURITY.md](SECURITY.md).
Discordâncias sobre achados devem citar código, contrato e evidência; uma hipótese do modelo
não obriga uma correção sem defeito demonstrado.
