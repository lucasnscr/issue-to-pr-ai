package dev.continuousai.catalog.product;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record ProductRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9_-]{1,39}")
        @Schema(example = "BOOK-001") String sku,
        @NotBlank @Size(max = 120) @Schema(example = "Kubernetes na prática") String name,
        @Size(max = 2000) String description,
        @NotBlank @Size(max = 80) @Schema(example = "books") String category,
        @NotNull @DecimalMin("0.01") @Digits(integer = 10, fraction = 2)
        @Schema(example = "99.90") BigDecimal price) {}
