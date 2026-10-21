package dev.continuousai.catalog.product;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(nullable = false, unique = true, length = 40)
    private String sku;
    @Column(nullable = false, length = 120)
    private String name;
    @Column(nullable = false, length = 2000)
    private String description;
    @Column(nullable = false, length = 80)
    private String category;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    protected Product() {}

    public Product(ProductRequest request) {
        update(request);
    }

    public void update(ProductRequest request) {
        sku = request.sku().trim().toUpperCase(Locale.ROOT);
        name = request.name().trim();
        description = request.description() == null ? "" : request.description().trim();
        category = request.category().trim().toLowerCase(Locale.ROOT);
        price = request.price();
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    public UUID getId() { return id; }
    public String getSku() { return sku; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getCategory() { return category; }
    public BigDecimal getPrice() { return price; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
