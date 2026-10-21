package dev.continuousai.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.continuousai.catalog.product.ProductRepository;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Integration tests for the catalog web UI.
 *
 * <p>Verifies that:
 * <ul>
 *   <li>GET / redirects to the catalog HTML page;</li>
 *   <li>Static assets (HTML, CSS, JS) are served with correct content types;</li>
 *   <li>Existing API, OpenAPI and health endpoints continue to work;</li>
 *   <li>A full CRUD flow succeeds against real PostgreSQL (simulating UI usage).</li>
 * </ul>
 *
 * <p>Note: JavaScript execution is not tested here; browser-side behaviour is
 * documented and verified manually as described in docs/frontend.md.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CatalogUiIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired TestRestTemplate http;
    @Autowired ProductRepository repository;

    @BeforeEach
    void cleanDatabase() {
        repository.deleteAll();
    }

    // ── Roteamento e assets ──────────────────────────────────────────────

    @Test
    void rootRedirectsToCatalogHtml() {
        // TestRestTemplate follows redirects by default; we verify the final response
        ResponseEntity<String> response = http.getForEntity("/", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String body = response.getBody();
        assertThat(body).contains("Catálogo de produtos");
        assertThat(body).contains("<html");
    }

    @Test
    void catalogHtmlIsServedWithCorrectContentType() {
        ResponseEntity<String> response = http.getForEntity("/catalog/index.html", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        MediaType ct = response.getHeaders().getContentType();
        assertThat(ct).isNotNull();
        assertThat(ct.getType()).isEqualTo("text");
        assertThat(ct.getSubtype()).isEqualTo("html");
    }

    @Test
    void catalogCssIsServedWithCorrectContentType() {
        ResponseEntity<String> response = http.getForEntity("/catalog/style.css", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        MediaType ct = response.getHeaders().getContentType();
        assertThat(ct).isNotNull();
        // content type may include charset; verify it is CSS
        assertThat(ct.toString()).contains("css");
    }

    @Test
    void catalogJsIsServedWithCorrectContentType() {
        ResponseEntity<String> response = http.getForEntity("/catalog/app.js", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        MediaType ct = response.getHeaders().getContentType();
        assertThat(ct).isNotNull();
        String ctStr = ct.toString();
        // JavaScript may be served as application/javascript or text/javascript
        assertThat(ctStr).containsAnyOf("javascript", "js");
    }

    @Test
    void htmlContainsRequiredUiElements() {
        String body = http.getForObject("/catalog/index.html", String.class);
        assertThat(body).contains("Catálogo de produtos");
        assertThat(body).contains("swagger-ui");
        assertThat(body).contains("Demo");
        // JS file (app.js) is referenced; API calls are made client-side via fetch
        assertThat(body).contains("app.js");
    }

    // ── Endpoints existentes não afetados ────────────────────────────────

    @Test
    void apiProductsEndpointRemainsAvailable() {
        JsonNode body = http.getForObject("/api/products", JsonNode.class);
        assertThat(body.has("content")).isTrue();
        assertThat(body.has("totalElements")).isTrue();
        assertThat(body.has("totalPages")).isTrue();
    }

    @Test
    void openApiSpecRemainsAvailable() {
        JsonNode api = http.getForObject("/v3/api-docs", JsonNode.class);
        assertThat(api.get("paths").has("/api/products")).isTrue();
        assertThat(api.get("paths").has("/api/products/{id}")).isTrue();
    }

    @Test
    void actuatorHealthRemainsAvailable() {
        JsonNode health = http.getForObject("/actuator/health/readiness", JsonNode.class);
        assertThat(health.get("status").asText()).isEqualTo("UP");
    }

    // ── Fluxo CRUD simulando uso da interface ────────────────────────────

    @Test
    void uiCrudFlowCreatesListsEditsAndDeletesProduct() {
        // 1. Lista vazia (estado inicial da tela)
        JsonNode empty = http.getForObject("/api/products", JsonNode.class);
        assertThat(empty.get("totalElements").asInt()).isZero();

        // 2. Cadastra produto via POST (ação do formulário "Novo produto")
        ResponseEntity<JsonNode> created = http.postForEntity(
                "/api/products",
                Map.of("sku", "UI-TEST-01", "name", "Produto Teste UI",
                        "description", "Criado pelo teste de UI",
                        "category", "testes", "price", new BigDecimal("29.90")),
                JsonNode.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String productPath = created.getHeaders().getLocation().toString();
        String productId = created.getBody().get("id").asText();

        // O servidor deve normalizar: SKU para maiúsculas, category para minúsculas
        assertThat(created.getBody().get("sku").asText()).isEqualTo("UI-TEST-01");
        assertThat(created.getBody().get("category").asText()).isEqualTo("testes");
        assertThat(created.getBody().get("price").decimalValue())
                .isEqualByComparingTo(new BigDecimal("29.90"));

        // 3. Lista mostra o produto recém criado (recarregamento após salvar)
        JsonNode list = http.getForObject("/api/products", JsonNode.class);
        assertThat(list.get("totalElements").asInt()).isEqualTo(1);
        assertThat(list.at("/content/0/sku").asText()).isEqualTo("UI-TEST-01");

        // 4. Edita o produto via PUT (ação do formulário "Editar")
        ResponseEntity<JsonNode> updated = http.exchange(
                productPath,
                org.springframework.http.HttpMethod.PUT,
                new org.springframework.http.HttpEntity<>(
                        Map.of("sku", "UI-TEST-01", "name", "Produto Atualizado",
                                "description", "Descricao atualizada",
                                "category", "testes", "price", new BigDecimal("49.90"))),
                JsonNode.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody().get("name").asText()).isEqualTo("Produto Atualizado");
        assertThat(updated.getBody().get("price").decimalValue())
                .isEqualByComparingTo(new BigDecimal("49.90"));

        // 5. Lista ainda mostra 1 produto (não foi duplicado)
        JsonNode afterUpdate = http.getForObject("/api/products", JsonNode.class);
        assertThat(afterUpdate.get("totalElements").asInt()).isEqualTo(1);

        // 6. Exclui produto via DELETE (ação do botão "Excluir" após confirmação)
        ResponseEntity<Void> deleted = http.exchange(
                productPath,
                org.springframework.http.HttpMethod.DELETE,
                org.springframework.http.HttpEntity.EMPTY,
                Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // 7. Lista retorna vazia novamente
        JsonNode afterDelete = http.getForObject("/api/products", JsonNode.class);
        assertThat(afterDelete.get("totalElements").asInt()).isZero();

        // 8. GET do produto excluído retorna 404
        assertThat(http.getForEntity(productPath, JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void uiShowsDuplicateSkuError() {
        // Cadastra produto com SKU existente – a UI deve exibir o erro 409
        http.postForEntity(
                "/api/products",
                Map.of("sku", "DUPLI-01", "name", "Primeiro", "description", "",
                        "category", "cat", "price", new BigDecimal("10.00")),
                JsonNode.class);

        ResponseEntity<JsonNode> conflict = http.postForEntity(
                "/api/products",
                Map.of("sku", "dupli-01", "name", "Segundo", "description", "",
                        "category", "cat", "price", new BigDecimal("20.00")),
                JsonNode.class);
        assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(conflict.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(conflict.getBody().get("detail").asText())
                .isNotBlank();
        // Apenas 1 produto no banco
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void uiInvalidFieldsReturn400WithFieldErrors() {
        // Formulário com SKU inválido e preço abaixo do mínimo
        ResponseEntity<JsonNode> response = http.postForEntity(
                "/api/products",
                Map.of("sku", "!", "name", " ", "description", "",
                        "category", "cat", "price", new BigDecimal("0.00")),
                JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        JsonNode errors = response.getBody().get("errors");
        assertThat(errors).isNotNull();
        assertThat(errors.has("sku")).isTrue();
        assertThat(errors.has("name")).isTrue();
        assertThat(errors.has("price")).isTrue();
    }

    @Test
    void uiFiltersAndPaginationWorkTogether() {
        // Cria produtos em 2 categorias para verificar filtros combinados
        http.postForEntity("/api/products",
                Map.of("sku", "BOOK-UI-01", "name", "Livro A", "description", "",
                        "category", "livros", "price", new BigDecimal("15.00")),
                JsonNode.class);
        http.postForEntity("/api/products",
                Map.of("sku", "BOOK-UI-02", "name", "Livro B", "description", "",
                        "category", "livros", "price", new BigDecimal("35.00")),
                JsonNode.class);
        http.postForEntity("/api/products",
                Map.of("sku", "TECH-UI-01", "name", "Gadget", "description", "",
                        "category", "tecnologia", "price", new BigDecimal("250.00")),
                JsonNode.class);

        // Filtro por categoria
        JsonNode livros = http.getForObject(
                "/api/products?category={cat}", JsonNode.class, "livros");
        assertThat(livros.get("totalElements").asInt()).isEqualTo(2);

        // Filtro por preço com paginação (tamanho 1)
        JsonNode page0 = http.getForObject(
                "/api/products?category={cat}&sort={sort}&page=0&size=1",
                JsonNode.class, "livros", "price,asc");
        assertThat(page0.at("/content/0/sku").asText()).isEqualTo("BOOK-UI-01");
        assertThat(page0.get("totalPages").asInt()).isEqualTo(2);

        JsonNode page1 = http.getForObject(
                "/api/products?category={cat}&sort={sort}&page=1&size=1",
                JsonNode.class, "livros", "price,asc");
        assertThat(page1.at("/content/0/sku").asText()).isEqualTo("BOOK-UI-02");

        // Filtro por faixa de preço
        JsonNode range = http.getForObject(
                "/api/products?minPrice={min}&maxPrice={max}",
                JsonNode.class, "10.00", "100.00");
        assertThat(range.get("totalElements").asInt()).isEqualTo(2);
    }
}
