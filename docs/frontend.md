# Interface web do catálogo de produtos

Interface leve em HTML, CSS e JavaScript nativos, servida pelo próprio Spring Boot na mesma
origem. Não utiliza npm, frameworks, CDNs, fontes externas ou serviços de terceiros.

## Acesso

| URL | Descrição |
|---|---|
| `http://localhost:8080/` | Redireciona para a interface (GET /) |
| `http://localhost:8080/catalog/index.html` | Página direta do catálogo |
| `http://localhost:8080/swagger-ui/index.html` | Swagger / OpenAPI (link disponível na UI) |

O endpoint `GET /` é gerenciado por `CatalogViewController`, que redireciona para o asset
estático em `src/main/resources/static/catalog/`. A API, Swagger e Actuator não são afetados.

## Funcionalidades

- **Listar produtos**: exibe SKU, nome, categoria e preço formatado em pt-BR, com total e página.
- **Filtrar**: por categoria (case-insensitive), preço mínimo/máximo e ordenação
  (padrão / preço crescente / preço decrescente). Filtros se combinam com paginação.
- **Paginar**: botões "Anterior" e "Próxima" com indicador de página atual e total.
  Tamanho de página: 10, 20 ou 50 itens. Filtros são preservados ao navegar entre páginas.
  Ao alterar um filtro, a lista retorna à primeira página.
- **Criar produto**: formulário com SKU, nome, descrição (opcional), categoria e preço.
  Respeita os limites de `ProductRequest` (SKU 2–40 chars, nome max 120, preço mín. 0,01).
- **Editar produto**: mesmo formulário preenchido com dados do servidor; recarrega após salvar.
- **Excluir produto**: requer confirmação. Cancelar não envia a requisição. Se a última linha
  da última página for removida, a lista retrocede para uma página válida.
- **Tratamento de erros**: carregamento, lista vazia, erro de rede e respostas ProblemDetail
  400/404/409 são tratados. Formulário é preservado em caso de erro; erros de campo são
  exibidos ao lado de cada campo. Envio duplicado durante mutação em andamento é bloqueado.
- **Segurança**: todos os dados vindos da API são inseridos via `textContent` (nunca
  `innerHTML`). Um nome como `<img src=x onerror=alert(1)>` aparece como texto puro.
- **Acessibilidade**: labels associados aos campos, botões com nomes claros, foco visível,
  mensagens de status com `aria-live`, navegável por teclado em viewport de 390 px.

## Roteiro manual pelo navegador

### Pré-requisito

```sh
docker compose up --build -d
# Aguarde o health check
curl --fail http://localhost:8080/actuator/health/readiness
```

### 1. Abrir a interface

Acesse `http://localhost:8080/`. A página deve carregar com título "Catálogo de produtos",
link para Swagger e badge "Demo". A lista começa vazia se o banco estiver limpo.

### 2. Criar produtos (CRUD – Create)

1. Clique em **+ Novo produto**.
2. Preencha: SKU `LIVRO-001`, Nome `Kubernetes na prática`, Categoria `livros`, Preço `99.90`.
3. Clique em **Salvar**. O servidor normaliza: SKU → `LIVRO-001` (maiúsculas),
   categoria → `livros` (minúsculas). A lista recarrega e exibe o produto.
4. Repita para criar mais produtos em categorias distintas (`tecnologia`, `cursos`).

### 3. Listar e verificar dados reais

Observe que a tabela exibe os valores reais retornados pela API (`/api/products`).
O preço é formatado em pt-BR (ex.: R$ 99,90). O rodapé mostra total e intervalo de linhas.

### 4. Filtros

- **Categoria**: digite `livros` em "Categoria" e clique em **Filtrar**. Apenas produtos
  dessa categoria são exibidos. A busca é case-insensitive.
- **Faixa de preço**: preencha "Preço mínimo" com `10,00` e "Preço máximo" com `50,00`.
  Produtos fora do intervalo somem da lista.
- **Combinado**: categoria + faixa de preço ao mesmo tempo.
- **Ordenação**: selecione "Preço crescente" — a lista é reordenada. Alterne para
  "Preço decrescente".
- **Limpar**: clique em **Limpar** para remover todos os filtros.

### 5. Paginação

Crie mais de 20 produtos. Selecione "10" em "Itens por página" e clique em **Filtrar**.
Navegue com "Próxima" e "Anterior". Os filtros devem ser preservados entre páginas.

### 6. Editar produto

Clique em **Editar** na linha de um produto. Altere o nome e o preço, clique em **Atualizar**.
A lista recarrega mostrando os novos valores. O servidor aplica normalização (SKU em maiúsculas,
categoria em minúsculas) — a UI exibe o resultado normalizado.

### 7. Duplicidade de SKU

Tente criar um produto com o mesmo SKU de outro já existente (maiúsculas e minúsculas são
equivalentes). O servidor retorna `409 Conflict` e o formulário permanece aberto com a
mensagem de erro. Nenhum produto duplicado é inserido.

### 8. Exclusão com confirmação

Clique em **Excluir** em qualquer produto. Surge um modal de confirmação. Clique em
**Cancelar** — nenhuma requisição é enviada. Clique novamente em **Excluir** e confirme:
o produto é removido. Se era o último da última página, a lista retrocede.

### 9. Responsividade

Redimensione o navegador para 390 px de largura. A interface deve permanecer legível
e utilizável: filtros empilhados, tabela rolável, formulário em coluna única.

## Limitações verificadas

- **Execução JavaScript no navegador não é testada automaticamente**: os testes
  `CatalogUiIT` verificam entrega dos assets (status, tipo de conteúdo, conteúdo do HTML)
  e um fluxo CRUD real via API. As interações de UI dependem do navegador para execução
  do JavaScript e não foram executadas em ambiente de CI automatizado.
- **Sem autenticação**: a interface é aberta, adequada apenas para ambientes de demonstração.
- **Sem dados de demonstração automáticos**: o banco começa vazio; os dados são inseridos
  manualmente pelo usuário.
- **Sem validação de minPrice = 0 via UI**: o campo aceita o valor zero, que é repassado
  à API. A API aceita `minPrice=0.00` como filtro válido (inclusivo).
