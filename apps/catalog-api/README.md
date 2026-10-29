# Aplicação de laboratório: catálogo

Java 21, Spring Boot, PostgreSQL e Flyway. O produto fornece comportamento verificável
para exercitar o método de desenvolvimento com IA: CRUD, filtros, paginação, ordenação,
listagem completa de categorias e interface web em português.

Os comandos abaixo são executados na raiz do repositório.

## Executar e testar

```sh
docker compose up --build -d
make acceptance
./mvnw -B -ntp verify
```

Abra a [interface](http://localhost:8080/), o
[Swagger](http://localhost:8080/swagger-ui/index.html) ou o
[OpenAPI JSON](http://localhost:8080/v3/api-docs).
Compose usa credenciais locais de demonstração e portas em `127.0.0.1`; o volume preserva
o catálogo. `docker compose down` encerra os serviços. Testcontainers usa PostgreSQL real
em containers próprios para a integração. Falhas de Docker não são convertidas em testes ignorados.

Para executar apenas a JVM, suba `docker compose up -d postgres` e use
`./mvnw -pl apps/catalog-api spring-boot:run`. `./mvnw test` executa testes unitários.

## API

| Método | Endpoint | Resultado |
|---|---|---|
| POST | `/api/products` | Cria produto; `201` e `Location` |
| GET | `/api/products?page=0&size=20` | Lista paginada, ordenada por criação e ID |
| GET | `/api/products/categories` | Todas as categorias com produtos, sem duplicatas e em ordem alfabética; catálogo vazio retorna `[]`; cabeçalhos `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` estão presentes |
| GET | `/api/products?category=books` | Lista filtrada por categoria (opcional, case-insensitive) |
| GET | `/api/products?minPrice=10.00&maxPrice=99.99` | Lista filtrada por faixa de preço (limites inclusivos, combinável com `category`) |
| GET | `/api/products?sort=price,asc` | Lista ordenada por preço crescente (desempate por ID) |
| GET | `/api/products?sort=price,desc` | Lista ordenada por preço decrescente (desempate por ID) |
| GET | `/api/products/{id}` | Consulta por UUID |
| PUT | `/api/products/{id}` | Substitui campos editáveis |
| DELETE | `/api/products/{id}` | Exclui; `204` |

SKU: 2–40 caracteres alfanuméricos, `_` ou `-`, começando por um alfanumérico; armazenado em maiúsculas.
Nome e categoria são obrigatórios; categoria é normalizada para minúsculas. Descrição é opcional.
Preço: de `0.01` a `9999999999.99`, com até duas casas decimais. Páginas começam em zero e têm tamanho de 1 a 100.
Filtro `category`: opcional; a comparação ignora maiúsculas/minúsculas e remove espaços externos.
Categoria inexistente retorna página vazia. Parâmetro presente mas em branco retorna `400`.
Filtros `minPrice` e `maxPrice`: opcionais, independentes e combináveis entre si e com `category`.
Limites são inclusivos. Valores negativos, com mais de duas casas decimais, ou `minPrice > maxPrice` retornam `400`.
Paginação e totais são calculados somente sobre os produtos filtrados.
Parâmetro `sort`: opcional. Valores aceitos: `price,asc` e `price,desc`. Preços iguais são desempatados por ID ascendente.
Sem `sort`, a ordem padrão (data de criação e ID) é preservada. Qualquer outro valor retorna `400`.
Erros usam `application/problem+json`: `400` para entrada inválida, `404` para produto ausente,
`409` para SKU duplicado. A API é uma aplicação de demonstração sem autenticação de usuários.

## Exemplos

```sh
curl --fail -X POST http://localhost:8080/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"BOOK-001","name":"Exemplo de catálogo","category":"books","price":99.90}'
curl --fail 'http://localhost:8080/api/products?category=books&minPrice=50&sort=price,asc&page=0&size=10'
curl --fail http://localhost:8080/api/products/categories
```

A interface cobre cadastro, filtros, edição e exclusão; veja o
[guia do frontend](../../docs/frontend.md). Os testes Java verificam HTTP/assets, mas não
executam JavaScript no navegador. O [runbook de validação](../../docs/runbooks/validation.md)
distingue testes de scripts, PostgreSQL, Docker/HTTP, provedor e infraestrutura.

Para contribuir, preserve a API e migrations aplicadas, use BigDecimal e siga
[AGENTS.md](../../AGENTS.md). O [índice do método](../../docs/README.md) explica como essa
aplicação se conecta a issues, skills, revisão e correção.
