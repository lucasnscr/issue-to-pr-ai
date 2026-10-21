## Problema

Disponibilizar as categorias presentes no catálogo para consumidores da API.
Este é um exercício opcional ainda não implementado, para uma nova demonstração.

## Critérios de aceite

- [ ] `GET /api/products/categories` retorna um array JSON de strings.
- [ ] Retornar somente categorias com produtos, sem duplicatas, em ordem alfabética ascendente.
- [ ] Catálogo vazio retorna `200` com `[]`.
- [ ] Preservar a normalização existente de categoria e não alterar produtos.
- [ ] Preservar CRUD, consulta por UUID, filtros, ordenação e paginação atuais.
- [ ] Adicionar testes HTTP/PostgreSQL para vazio, categorias repetidas, ordem e remoção da última ocorrência.
- [ ] Atualizar OpenAPI e README.

## Escopo

API, testes e documentação. Sem frontend, dependências ou alterações de workflows.
Executar `./mvnw -B -ntp verify` e entregar draft PR. O workflow faz a publicação.
