package dev.continuousai.catalog.product;

import java.util.List;
import org.springframework.data.domain.Page;

public record ProductPage(List<ProductResponse> content, int page, int size, long totalElements, int totalPages) {
    static ProductPage from(Page<Product> products) {
        return new ProductPage(products.map(ProductResponse::from).getContent(), products.getNumber(),
                products.getSize(), products.getTotalElements(), products.getTotalPages());
    }
}
