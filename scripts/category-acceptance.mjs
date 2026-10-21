import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:8080';
const paths = [];
const prefix = `LIVE-${Date.now()}`;
try {
  for (const [index, category] of ['books', 'books', 'games'].entries()) {
    const response = await fetch(`${base}/api/products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `${prefix}-${index}`, name: 'Acceptance product', category, price: 10 }),
    });
    assert.equal(response.status, 201);
    paths.push(response.headers.get('location'));
  }
  const first = await (await fetch(`${base}/api/products?category=%20BOOKS%20&size=1&page=0`)).json();
  const second = await (await fetch(`${base}/api/products?category=books&size=1&page=1`)).json();
  assert.equal(first.totalElements, 2, 'Totals must count only category matches.');
  assert.equal(first.totalPages, 2);
  assert.equal(first.content.length, 1);
  assert.equal(first.content[0].category, 'books');
  assert.equal(second.totalElements, 2);
  assert.equal(second.content.length, 1);
  assert.equal(second.content[0].category, 'books');
  assert.notEqual(first.content[0].id, second.content[0].id);
  const empty = await (await fetch(`${base}/api/products?category=missing-${prefix}`)).json();
  assert.equal(empty.totalElements, 0);
  assert.equal(empty.content.length, 0);
  assert.equal((await fetch(`${base}/api/products?category=%20`)).status, 400);
  assert.equal((await fetch(`${base}/api/products?category=`)).status, 400);
  const all = await (await fetch(`${base}/api/products`)).json();
  assert.equal(all.totalElements, 3, 'Omitting the filter must preserve all products.');
  console.log('Independent category acceptance passed: normalization, pagination, totals, empty result, invalid input.');
} finally {
  await Promise.all(paths.map(path => fetch(base + path, { method: 'DELETE' })));
}
