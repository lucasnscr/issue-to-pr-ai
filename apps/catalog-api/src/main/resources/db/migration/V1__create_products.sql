CREATE TABLE products (
    id UUID PRIMARY KEY,
    sku VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    category VARCHAR(80) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_products_sku UNIQUE (sku)
);

CREATE INDEX idx_products_created_at_id ON products (created_at, id);
