package dev.continuousai.catalog.product;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Validated
@RestController
@RequestMapping("/api/products")
@Tag(name = "Products", description = "Product catalog CRUD")
public class ProductController {
    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List products with stable pagination, optionally filtered by category and/or price range, " +
            "and optionally sorted by price")
    public ProductPage list(
            @Parameter(description = "Filter by category (case-insensitive, trims surrounding spaces). " +
                    "Returns 400 if present but blank.")
            @RequestParam(required = false) Optional<String> category,
            @Parameter(description = "Minimum price (inclusive). Must be >= 0.00 and have at most 2 decimal places.")
            @RequestParam(required = false)
            @DecimalMin(value = "0.00", message = "minPrice must be >= 0.00")
            @Digits(integer = 10, fraction = 2, message = "minPrice must have at most 2 decimal places")
            BigDecimal minPrice,
            @Parameter(description = "Maximum price (inclusive). Must be >= 0.00 and have at most 2 decimal places.")
            @RequestParam(required = false)
            @DecimalMin(value = "0.00", message = "maxPrice must be >= 0.00")
            @Digits(integer = 10, fraction = 2, message = "maxPrice must have at most 2 decimal places")
            BigDecimal maxPrice,
            @Parameter(description = "Sort order for the result. Accepted values: 'price,asc' (ascending by price) " +
                    "and 'price,desc' (descending by price). Equal prices are broken by ID ascending. " +
                    "Omit to keep the default order (creation date + ID). Any other value returns 400.")
            @RequestParam(required = false)
            @Pattern(regexp = "price,(asc|desc)", message = "sort must be 'price,asc' or 'price,desc'")
            String sort,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {

        if (category.isPresent() && category.get().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Query parameter 'category' must not be blank.");
        }
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "minPrice must not be greater than maxPrice.");
        }

        String categoryValue = category.orElse(null);
        return service.listWithFilters(categoryValue, minPrice, maxPrice, sort, page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Find a product by ID")
    public ProductResponse find(@PathVariable UUID id) {
        return service.find(id);
    }

    @PostMapping
    @Operation(summary = "Create a product with a unique SKU")
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest request) {
        ProductResponse product = service.create(request);
        return ResponseEntity.created(URI.create("/api/products/" + product.id())).body(product);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a product")
    public ProductResponse update(@PathVariable UUID id, @Valid @RequestBody ProductRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a product")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
