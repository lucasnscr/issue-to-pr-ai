## Problema

Permitir `sort=price,asc` e `sort=price,desc` na listagem do catálogo.

## Critérios de aceite

- [ ] Sem `sort`, preservar a ordem atual por criação e ID.
- [ ] Aceitar somente os dois valores definidos; parâmetros arbitrários retornam 400.
- [ ] Usar ID como desempate determinístico para preços iguais.
- [ ] Preservar filtros, paginação e totais.
- [ ] Adicionar testes com preços iguais, ascendente, descendente e parâmetros inválidos.
- [ ] Atualizar OpenAPI e README.

## Escopo

API, testes e documentação. Executar `./mvnw -B -ntp verify` e entregar PR em draft.
