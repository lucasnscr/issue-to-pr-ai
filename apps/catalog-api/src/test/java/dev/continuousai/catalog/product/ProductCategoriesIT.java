package dev.continuousai.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.net.URI;
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
    void removesCategoryOnlyAfterDeletingItsLastProduct() {
        URI first = create("CAT-01", "tech");
        URI second = create("CAT-02", "TECH");
        create("CAT-03", "books");
        http.delete(first.toString());
        assertThat(http.getForObject("/api/products/categories", String[].class)).containsExactly("books", "tech");
        http.delete(second.toString());
        assertThat(http.getForObject("/api/products/categories", String[].class)).containsExactly("books");
    }

    private URI create(String sku, String category) {
        ResponseEntity<Void> response = http.postForEntity("/api/products", Map.of(
                "sku", sku, "name", "Category test product", "category", category,
                "price", new BigDecimal("10.00")), Void.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getHeaders().getLocation();
    }
}
