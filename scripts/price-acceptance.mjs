import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:8080';
const category = `price-${Date.now()}`;
const paths = [];
const list = async params => {
  const response = await fetch(`${base}/api/products?${new URLSearchParams({ category, ...params })}`);
  assert.equal(response.status, 200, `List failed: ${response.status}`);
  return response.json();
};
try {
  for (const price of [10, 20, 30]) {
    const response = await fetch(`${base}/api/products`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `PRICE-${Date.now()}-${price}`, name: `Price ${price}`, category, price }) });
    assert.equal(response.status, 201);
    paths.push(response.headers.get('location'));
  }
  assert.equal((await list({})).totalElements, 3);
  assert.deepEqual((await list({ minPrice: '20.00' })).content.map(p => Number(p.price)).sort((a,b) => a-b), [20, 30]);
  assert.deepEqual((await list({ maxPrice: '20.00' })).content.map(p => Number(p.price)).sort((a,b) => a-b), [10, 20]);
  assert.equal((await list({ minPrice: '20.00', maxPrice: '20.00' })).totalElements, 1);
  const first = await list({ minPrice: '10', maxPrice: '30', size: '1', page: '0' });
  const second = await list({ minPrice: '10', maxPrice: '30', size: '1', page: '1' });
  assert.equal(first.totalElements, 3);
  assert.equal(first.totalPages, 3);
  assert.notEqual(first.content[0].id, second.content[0].id);
  assert.equal((await list({ minPrice: '11', maxPrice: '19' })).totalElements, 0);
  for (const params of [{ minPrice: '-1' }, { maxPrice: '-1' }, { minPrice: '1.001' },
    { maxPrice: '1.001' }, { minPrice: '30', maxPrice: '10' }, { minPrice: 'abc' }]) {
    const response = await fetch(`${base}/api/products?${new URLSearchParams(params)}`);
    assert.equal(response.status, 400, `Expected rejection for ${JSON.stringify(params)}`);
  }
  console.log('Price acceptance passed: real PostgreSQL, inclusive ranges, combined category/pagination and invalid input.');
} finally {
  for (const path of paths) if (path) await fetch(base + path, { method: 'DELETE' });
}
