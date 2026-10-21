import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const base = process.env.BASE_URL || 'http://localhost:8080';
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${base}/actuator/health/readiness`, { signal: AbortSignal.timeout(2000) });
    if (response.ok && (await response.json()).status === 'UP') { ready = true; break; }
  } catch { /* Application may still be starting. */ }
  await setTimeout(1500);
}
assert(ready, 'Application did not become ready within the smoke-test deadline.');

let productPath;
try {
  const created = await fetch(`${base}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku: `SMOKE-${Date.now()}`, name: 'Smoke test', category: 'checks', price: 9.90 }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(created.status, 201);
  productPath = created.headers.get('location');
  assert(productPath?.startsWith('/api/products/'));
  const loaded = await fetch(base + productPath);
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).name, 'Smoke test');
  const spec = await (await fetch(`${base}/v3/api-docs`)).json();
  assert(spec.paths['/api/products']);
  const deleted = await fetch(base + productPath, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const missing = await fetch(base + productPath);
  assert.equal(missing.status, 404);
  productPath = undefined;
  console.log('Smoke passed: readiness, HTTP CRUD, deletion, and OpenAPI.');
} finally {
  if (productPath) await fetch(base + productPath, { method: 'DELETE' });
}
