package dev.continuousai.catalog.product;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/products")
@Tag(name = "Products", description = "Product catalog CRUD")
public class ProductController {
    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List products with stable pagination, optionally filtered by category")
    public ProductPage list(
            @Parameter(description = "Filter by category (case-insensitive, trims surrounding spaces). " +
                    "Returns 400 if present but blank.")
            @RequestParam(required = false) Optional<String> category,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        if (category.isPresent()) {
            if (category.get().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Query parameter 'category' must not be blank.");
            }
            return service.listByCategory(category.get(), page, size);
        }
        return service.list(page, size);
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
