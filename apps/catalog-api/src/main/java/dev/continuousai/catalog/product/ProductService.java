package dev.continuousai.catalog.product;

import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ProductService {
    private final ProductRepository repository;

    public ProductService(ProductRepository repository) {
        this.repository = repository;
    }

    public ProductPage list(int page, int size) {
        return ProductPage.from(repository.findAll(PageRequest.of(page, size, Sort.by("createdAt", "id"))));
    }

    public ProductPage listByCategory(String category, int page, int size) {
        String normalized = category.trim();
        return ProductPage.from(
                repository.findByCategory(normalized, PageRequest.of(page, size, Sort.by("createdAt", "id"))));
    }

    public ProductPage listWithFilters(String category, BigDecimal minPrice, BigDecimal maxPrice,
                                       int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("createdAt", "id"));
        boolean hasCategory = category != null;
        boolean hasPriceFilter = minPrice != null || maxPrice != null;

        if (hasCategory && hasPriceFilter) {
            return ProductPage.from(
                    repository.findByCategoryAndPriceRange(category.trim(), minPrice, maxPrice, pageable));
        }
        if (hasCategory) {
            return ProductPage.from(repository.findByCategory(category.trim(), pageable));
        }
        if (hasPriceFilter) {
            return ProductPage.from(repository.findByPriceRange(minPrice, maxPrice, pageable));
        }
        return ProductPage.from(repository.findAll(pageable));
    }

    public ProductResponse find(UUID id) {
        return ProductResponse.from(findEntity(id));
    }

    @Transactional
    public ProductResponse create(ProductRequest request) {
        return ProductResponse.from(repository.saveAndFlush(new Product(request)));
    }

    @Transactional
    public ProductResponse update(UUID id, ProductRequest request) {
        Product product = findEntity(id);
        product.update(request);
        return ProductResponse.from(repository.saveAndFlush(product));
    }

    @Transactional
    public void delete(UUID id) {
        repository.delete(findEntity(id));
    }

    private Product findEntity(UUID id) {
        return repository.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
    }
}
