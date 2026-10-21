# Demonstração de 15 minutos

Use apenas o catálogo público com dados fictícios. Os casos propostos são hipóteses de piloto de engenharia, sem implantação corporativa.

## Preparação

- Confira CI da `main`, credencial válida e limites em `config/ai-policy.json`.
- Separe os links da issue, execução, artefatos, draft PR e comentário de revisão.
- Para o ciclo atual, abra o [relatório da PR #32](validacao-engineering-loop.md), os dois commits do bot e o estado `needs-human`.
- Inicie `docker compose up --build -d` e abra `/` para a interface ou `/swagger-ui.html` para explorar a API.
- Tenha o PDF da apresentação e uma gravação/evidência de execução pronta.
- Uma geração real pode levar vários minutos. Dispare no início e use a execução concluída como reserva.

## Roteiro

| Tempo | Conteúdo |
|---|---|
| 0–2 min | Uma issue com critérios de aceite e escopo pequeno |
| 2–5 min | Gate de permissão, inferência sem token de publicação e validação independente |
| 5–8 min | PR #32: revisão, duas correções reais, regressões e commits na mesma branch |
| 8–11 min | API e PostgreSQL/Docker, categorias completas e parada para triagem dos achados |
| 11–13 min | Modelo de trabalho da equipe, próximos incrementos e Cursor como alternativa |
| 13–15 min | Limites, custo estimado, piloto e perguntas |

A aplicação inclui interface web própria, API, banco e infraestrutura. O Swagger continua como explorador da API.
Na interface, demonstre cadastro, filtros, edição e exclusão de um produto sintético; veja o [roteiro do frontend](frontend.md).
Para uma demonstração apenas de API/banco/infraestrutura, use Swagger ou HTTP e os relatórios.
O teste Kubernetes local inclui persistência após recriar o Pod. vLLM/ARC continuam dependentes de GPU e credenciais apropriadas.

Explique que o ciclo terminou no limite de duas tentativas e exigiu triagem assistida.
`needs-human` é uma parada prevista; a Action verde não significa aprovação automática.
A [arquitetura](architecture.md) mostra os estados e a separação entre agente, validação e publisher.

## Tarefa nova

Filtro de categoria, faixa de preço, ordenação e [listagem de categorias](demo-issues/04-list-categories.md)
já foram implementados. Use suas execuções concluídas como evidência. Para uma tarefa nova
ao vivo, escolha um comportamento ainda ausente, escreva os critérios e confira o escopo
com o responsável, seguindo o [modelo de trabalho](modelo-de-trabalho.md).
Não repita issues cujo aceite já esteja atendido na base. O script `seed-demo-issues.mjs`
ainda seleciona o exercício 04 por padrão; sua prévia não comprova que uma tarefa é nova.
Evite `--create` para esses exemplos históricos na base atual.
Na issue autorizada comente `/oc implemente esta issue` ou `@claude implemente esta issue`.
A PR só aparece após os testes. A IA não decide o merge.

## Comandos da aplicação

```sh
node scripts/smoke.mjs
node scripts/category-acceptance.mjs
node scripts/price-acceptance.mjs
node scripts/ordering-acceptance.mjs
curl --fail http://localhost:8080/api/products/categories
```

Os scripts HTTP verificam os contratos existentes; a regressão da listagem de categorias
também está na suíte `ProductCategoriesIT`. O relatório do ciclo registra a prova independente
com mais de uma página de produtos e com dados inseridos diretamente no PostgreSQL.

Mostre o artefato `ai-usage.json`: tokens por dimensão, custo estimado, limites e decisão de política.
Não apresente estimativa como fatura nem generalize um resultado para ganho de produtividade.
Escolha tarefas comparáveis para medir tempo total, intervenção humana, falhas e consumo em um piloto.
Use o [roadmap](roadmap.md) para discutir evolução do processo; as propostas ainda não estão implementadas.
