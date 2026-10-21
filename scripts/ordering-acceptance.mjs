import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:8080';
const category = `ordering-${Date.now()}`;
const paths = [];
const list = async params => {
  const response = await fetch(`${base}/api/products?${new URLSearchParams({ category, ...params })}`);
  assert.equal(response.status, 200);
  return response.json();
};
try {
  for (const [index, price] of [30, 20, 10, 20].entries()) {
    const response = await fetch(`${base}/api/products`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `SORT-${Date.now()}-${index}`, name: `Sort ${index}`, category, price }) });
    assert.equal(response.status, 201);
    paths.push(response.headers.get('location'));
  }
  for (const [sort, expected] of [['price,asc', [10,20,20,30]], ['price,desc', [30,20,20,10]]]) {
    const page = await list({ sort });
    assert.deepEqual(page.content.map(p => Number(p.price)), expected);
    const ties = page.content.filter(p => Number(p.price) === 20).map(p => p.id);
    assert.deepEqual(ties, [...ties].sort(), 'Equal prices must use ascending ID as the stable tie-breaker.');
    const pages = await Promise.all([0,1,2,3].map(page => list({ sort, size: '1', page: String(page) })));
    assert.equal(new Set(pages.flatMap(p => p.content.map(item => item.id))).size, 4);
    assert(pages.every(p => p.totalElements === 4 && p.totalPages === 4));
    assert.equal((await list({ sort, minPrice: '20', maxPrice: '20' })).totalElements, 2);
  }
  for (const sort of ['name,asc', 'price', 'price,sideways', 'price,asc,id', '']) {
    const response = await fetch(`${base}/api/products?${new URLSearchParams({ sort })}`);
    assert.equal(response.status, 400, `Expected rejection for sort=${sort}`);
  }
  console.log('Ordering acceptance passed: both directions, deterministic ties, price/category combination and pagination.');
} finally {
  for (const path of paths) if (path) await fetch(base + path, { method: 'DELETE' });
}
