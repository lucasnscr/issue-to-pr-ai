package dev.continuousai.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProductApiIT {
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

    @Test
    void completesCrudLifecycle() {
        ResponseEntity<JsonNode> created = create("book-01", "First book", "49.90");
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode body = created.getBody();
        String path = created.getHeaders().getLocation().toString();
        assertThat(body.get("sku").asText()).isEqualTo("BOOK-01");
        assertThat(body.get("createdAt").asText()).isNotBlank();
        JsonNode loaded = http.getForEntity(path, JsonNode.class).getBody();
        assertThat(loaded.get("id")).isEqualTo(body.get("id"));
        assertThat(loaded.get("createdAt")).isEqualTo(body.get("createdAt"));
        assertThat(loaded.get("updatedAt")).isEqualTo(body.get("updatedAt"));

        ResponseEntity<JsonNode> updated = http.exchange(path, HttpMethod.PUT,
                new HttpEntity<>(request("book-02", "Updated book", "79.90")), JsonNode.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody().get("name").asText()).isEqualTo("Updated book");
        assertThat(updated.getBody().get("price").decimalValue()).isEqualByComparingTo("79.90");
        assertThat(updated.getBody().get("createdAt")).isEqualTo(body.get("createdAt"));
        assertThat(http.getForObject(path, JsonNode.class).get("updatedAt"))
                .isEqualTo(updated.getBody().get("updatedAt"));

        assertThat(http.exchange(path, HttpMethod.DELETE, HttpEntity.EMPTY, Void.class).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(http.getForEntity(path, JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void paginatesWithoutDuplicatingProducts() {
        create("BOOK-01", "First", "10.00");
        create("BOOK-02", "Second", "20.00");
        JsonNode first = http.getForObject("/api/products?page=0&size=1", JsonNode.class);
        JsonNode second = http.getForObject("/api/products?page=1&size=1", JsonNode.class);
        assertThat(first.get("totalElements").asInt()).isEqualTo(2);
        assertThat(first.get("totalPages").asInt()).isEqualTo(2);
        assertThat(first.get("content").size()).isEqualTo(1);
        assertThat(first.at("/content/0/id")).isNotEqualTo(second.at("/content/0/id"));
    }

    @Test
    void returnsEmptyPageForEmptyCatalog() {
        JsonNode body = http.getForObject("/api/products", JsonNode.class);
        assertThat(body.get("content").isEmpty()).isTrue();
        assertThat(body.get("totalElements").asInt()).isZero();
    }

    @Test
    void rejectsDuplicateSkuIgnoringCase() {
        create("BOOK-01", "First", "10.00");
        ResponseEntity<JsonNode> duplicate = create("book-01", "Second", "20.00");
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(duplicate.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void conflictingUpdatePreservesOriginalProduct() {
        create("BOOK-01", "First", "10.00");
        String path = create("BOOK-02", "Second", "20.00").getHeaders().getLocation().toString();
        ResponseEntity<JsonNode> response = http.exchange(path, HttpMethod.PUT,
                new HttpEntity<>(request("BOOK-01", "Overwrite", "30.00")), JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(http.getForObject(path, JsonNode.class).get("sku").asText()).isEqualTo("BOOK-02");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.001", "10000000000.00"})
    void rejectsInvalidPrices(String price) {
        ResponseEntity<JsonNode> response = create("BOOK-01", "Book", price);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("errors").has("price")).isTrue();
        assertThat(repository.count()).isZero();
    }

    @Test
    void rejectsBlankNameAndInvalidSku() {
        ResponseEntity<JsonNode> response = create("!", " ", "10.00");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("errors").has("sku")).isTrue();
        assertThat(response.getBody().get("errors").has("name")).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "size=0", "size=101", "page=abc"})
    void rejectsInvalidPagination(String query) {
        assertThat(http.getForEntity("/api/products?" + query, JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void returns404ForUnknownProductOnEveryOperation() {
        String path = "/api/products/" + UUID.randomUUID();
        assertThat(http.getForEntity(path, JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.exchange(path, HttpMethod.PUT,
                new HttpEntity<>(request("BOOK-01", "Book", "10.00")), JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.exchange(path, HttpMethod.DELETE, HttpEntity.EMPTY, JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void rejectsMalformedJsonAndUuid() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        assertThat(http.postForEntity("/api/products", new HttpEntity<>("{invalid", headers), JsonNode.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.getForEntity("/api/products/not-a-uuid", JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void exposesOpenApiAndReadiness() {
        JsonNode api = http.getForObject("/v3/api-docs", JsonNode.class);
        assertThat(api.get("paths").has("/api/products")).isTrue();
        assertThat(api.get("paths").has("/api/products/{id}")).isTrue();
        assertThat(http.getForObject("/actuator/health/readiness", JsonNode.class).get("status").asText())
                .isEqualTo("UP");
    }

    private ResponseEntity<JsonNode> create(String sku, String name, String price) {
        return http.postForEntity("/api/products", request(sku, name, price), JsonNode.class);
    }

    private Map<String, Object> request(String sku, String name, String price) {
        return Map.of("sku", sku, "name", name, "description", "A book", "category", "Books",
                "price", new BigDecimal(price));
    }
}
