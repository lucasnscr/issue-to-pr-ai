-- Composite index supporting ORDER BY price ASC/DESC, id ASC.
-- The id column is appended as a deterministic tiebreaker for equal prices.
CREATE INDEX idx_products_price_id ON products (price, id);
