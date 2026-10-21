package dev.continuousai.catalog.product;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ProductResponse(UUID id, String sku, String name, String description,
                              String category, BigDecimal price, Instant createdAt, Instant updatedAt) {
    static ProductResponse from(Product product) {
        return new ProductResponse(product.getId(), product.getSku(), product.getName(),
                product.getDescription(), product.getCategory(), product.getPrice(),
                product.getCreatedAt(), product.getUpdatedAt());
    }
}
