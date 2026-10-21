## Problema

Adicionar filtros opcionais `minPrice` e `maxPrice` à listagem de produtos.

## Critérios de aceite

- [ ] Limites inclusivos e independentes: aceitar apenas mínimo ou apenas máximo.
- [ ] Combinar os filtros com paginação e outros filtros já existentes.
- [ ] Rejeitar valores negativos, mais de duas casas decimais e mínimo maior que máximo com 400.
- [ ] Usar BigDecimal; valores iguais nos limites devem ser incluídos.
- [ ] Preservar listagem atual quando os parâmetros não forem enviados.
- [ ] Adicionar testes de integração para limites, intervalo vazio, entradas inválidas e totais.
- [ ] Atualizar OpenAPI e README.

## Escopo

API, testes e documentação. Executar `./mvnw -B -ntp verify` e entregar PR em draft.
