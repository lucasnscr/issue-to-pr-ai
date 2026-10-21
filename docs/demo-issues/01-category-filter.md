## Problema

O catálogo lista todos os produtos. Permitir filtrar por categoria usando `GET /api/products?category=books`.

## Critérios de aceite

- [ ] Filtro opcional; sem ele, preservar a listagem atual.
- [ ] Comparação sem diferença entre maiúsculas e minúsculas, com espaços externos removidos.
- [ ] Preservar paginação e calcular totais apenas dos produtos filtrados.
- [ ] Categoria inexistente retorna página vazia; parâmetro vazio retorna 400.
- [ ] Adicionar testes HTTP de integração para filtro, normalização, página vazia e paginação.
- [ ] Atualizar OpenAPI e README.

## Escopo

Alterar somente API, testes e documentação. Usar query parametrizada do Spring Data.
Executar `./mvnw -B -ntp verify` e entregar uma PR em draft vinculada a esta issue.
