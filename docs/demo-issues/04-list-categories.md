# Listagem de categorias — exercício implementado

**Status:** integrado pela [PR #32](https://github.com/lucasnscr/issue-to-pr-ai/pull/32),
com critérios definidos na [issue #31](https://github.com/lucasnscr/issue-to-pr-ai/issues/31).
Este arquivo preserva a especificação para consulta; não é uma tarefa pendente na base atual.
O [relatório do ciclo](../validacao-engineering-loop.md) documenta revisão, correções e testes.

## Problema

Disponibilizar as categorias presentes no catálogo para consumidores da API.
O endpoint está disponível como exemplo de entrega e regressão.

## Critérios de aceite

- [x] `GET /api/products/categories` retorna um array JSON de strings.
- [x] Retornar somente categorias com produtos, sem duplicatas, em ordem alfabética ascendente.
- [x] Catálogo vazio retorna `200` com `[]`.
- [x] Preservar a normalização existente de categoria e não alterar produtos.
- [x] Preservar CRUD, consulta por UUID, filtros, ordenação e paginação atuais.
- [x] Adicionar testes HTTP/PostgreSQL para vazio, categorias repetidas, ordem e remoção da última ocorrência.
- [x] Considerar todos os produtos, inclusive além de uma página de 20 itens.
- [x] Deduplicar variantes de caixa/espaços gravadas diretamente no PostgreSQL.
- [x] Atualizar OpenAPI e README.

## Escopo

API, testes e documentação. Sem frontend, dependências ou alterações de workflows.
Validação reproduzível: `./mvnw -B -ntp verify`, incluindo `ProductCategoriesIT`.
