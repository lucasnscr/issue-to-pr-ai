package dev.continuousai.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProductCategoriesIT {
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
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        repository.deleteAll();
    }

    @Test
    void returnsJsonArrayForEmptyCatalog() {
        ResponseEntity<String[]> response = http.getForEntity("/api/products/categories", String[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(response.getBody()).isEmpty();
    }

    @Test
    void returnsNormalizedDistinctCategoriesInAlphabeticalOrderWithoutMutatingProducts() {
        create("CAT-01", " Tech ");
        create("CAT-02", "BOOKS");
        create("CAT-03", "books");
        create("CAT-04", "games");
        assertThat(http.getForObject("/api/products/categories", String[].class))
                .containsExactly("books", "games", "tech");
        assertThat(repository.count()).isEqualTo(4);
    }

    @Test
    void returnsAllCategoriesWhenCatalogExceedsDefaultPageSize() {
        // Create 21 products each with a distinct category to exceed the former hard limit of 20.
        // Before the fix, the 21st category was silently omitted.
        for (int i = 1; i <= 21; i++) {
            create(String.format("SKU-%02d", i), String.format("category-%02d", i));
        }
        String[] categories = http.getForObject("/api/products/categories", String[].class);
        assertThat(categories).hasSize(21);
        for (int i = 1; i <= 21; i++) {
            assertThat(categories).contains(String.format("category-%02d", i));
        }
    }

    @Test
    void removesCategoryOnlyAfterDeletingItsLastProduct() {
        URI first = create("CAT-01", "tech");
        URI second = create("CAT-02", "TECH");
        create("CAT-03", "books");
        http.delete(first.toString());
        assertThat(http.getForObject("/api/products/categories", String[].class)).containsExactly("books", "tech");
        http.delete(second.toString());
        assertThat(http.getForObject("/api/products/categories", String[].class)).containsExactly("books");
    }

    @Test
    void includesNoStoreCacheControlHeader() {
        ResponseEntity<String[]> response = http.getForEntity("/api/products/categories", String[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(response.getBody()).isEmpty();
    }

    /**
     * Regression test for the P2 finding: when categories are stored with inconsistent
     * casing or surrounding spaces (e.g. via direct DB insertion, Flyway seed data, or
     * any path that bypasses {@code Product.update()}), the old query
     * {@code SELECT DISTINCT p.category ... ORDER BY p.category ASC} would return
     * duplicates such as "Tech" and " tech". The fixed query applies
     * {@code LOWER(TRIM(...))} at query time so deduplication is guaranteed regardless
     * of how the data entered the database.
     */
    @Test
    void deduplicatesCategoriesWithInconsistentCasingOrSpacesInsertedDirectlyIntoDatabase() {
        // Insert rows directly via JDBC, bypassing Product.update() normalization,
        // to simulate data that could arrive via Flyway seeds or direct SQL scripts.
        insertRaw("RAW-01", "Tech");
        insertRaw("RAW-02", " tech");   // leading space — bypasses trim()
        insertRaw("RAW-03", "TECH");    // upper-case — bypasses toLowerCase()
        insertRaw("RAW-04", "books");   // already normalized

        String[] categories = http.getForObject("/api/products/categories", String[].class);
        // All three "Tech" variants must collapse into a single "tech" entry.
        assertThat(categories).containsExactly("books", "tech");
    }

    /** Inserts a minimal product row directly via SQL, skipping entity-layer normalization. */
    private void insertRaw(String sku, String category) {
        jdbc.update(
                "INSERT INTO products (id, sku, name, description, category, price, created_at, updated_at)"
                        + " VALUES (?, ?, 'Raw product', '', ?, 9.99, NOW(), NOW())",
                UUID.randomUUID(), sku, category);
    }

    private URI create(String sku, String category) {
        ResponseEntity<Void> response = http.postForEntity("/api/products", Map.of(
                "sku", sku, "name", "Category test product", "category", category,
                "price", new BigDecimal("10.00")), Void.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getHeaders().getLocation();
    }
}
