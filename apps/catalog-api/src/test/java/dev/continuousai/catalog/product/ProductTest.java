package dev.continuousai.catalog.product;

import static org.assertj.core.api.Assertions.assertThat;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class ProductTest {
    @Test
    void normalizesInputWithoutLosingPricePrecision() {
        Product product = new Product(new ProductRequest("book-01", "  Book  ", null, " Books ",
                new BigDecimal("99.90")));
        assertThat(product.getSku()).isEqualTo("BOOK-01");
        assertThat(product.getName()).isEqualTo("Book");
        assertThat(product.getDescription()).isEmpty();
        assertThat(product.getCategory()).isEqualTo("books");
        assertThat(product.getPrice()).isEqualByComparingTo("99.90");
    }

    @Test
    void updateReplacesAllEditableFields() {
        Product product = new Product(new ProductRequest("AA", "Old", "Old", "old", BigDecimal.ONE));
        product.update(new ProductRequest("new-02", " New ", " Description ", " TECH ", new BigDecimal("2.50")));
        assertThat(product.getSku()).isEqualTo("NEW-02");
        assertThat(product.getName()).isEqualTo("New");
        assertThat(product.getDescription()).isEqualTo("Description");
        assertThat(product.getCategory()).isEqualTo("tech");
        assertThat(product.getPrice()).isEqualByComparingTo("2.50");
    }
}
