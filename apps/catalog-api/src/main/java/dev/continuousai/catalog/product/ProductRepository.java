package dev.continuousai.catalog.product;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    @Query("SELECT p FROM Product p WHERE LOWER(TRIM(p.category)) = LOWER(TRIM(:category))")
    Page<Product> findByCategory(@Param("category") String category, Pageable pageable);
}
