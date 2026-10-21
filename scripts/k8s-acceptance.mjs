import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// This command mutates only its dedicated local kind cluster. It never selects
// the user's current context or installs a runner/model in a remote cluster.
const cluster = 'issue-to-pr-ai-demo';
const context = `kind-${cluster}`;
const namespace = 'catalog';
const kind = process.env.KIND_BIN || 'kind';
const image = 'catalog-api:kubernetes-demo';
const nodeImage = 'kindest/node:v1.34.0@sha256:7416a61b42b1662ca6ca89f02028ac133a309a2a30ba309614e8ec94d976dc5a';
const mode = process.argv[2];
assert(['--deploy', '--inference-preflight'].includes(mode),
  'Usage: node scripts/k8s-acceptance.mjs --deploy | --inference-preflight');
const started = Date.now();
const criteria = [];
const report = { mode, startedAt: new Date().toISOString(), criteria, status: 'failed' };

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 600_000, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${binary} ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout?.trim() || '';
}

function kubectl(args, options) {
  return run('kubectl', ['--context', context, ...args], options);
}

function passed(description) {
  criteria.push(description);
  console.log(`PASS ${description}`);
}

async function request(base, path, status, method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, received ${response.status}`);
  return response;
}

async function inferencePreflight() {
  const base = process.env.VLLM_BASE_URL?.replace(/\/$/, '');
  const key = process.env.VLLM_API_KEY;
  const model = process.env.VLLM_MODEL || 'qwen-coder';
  assert(base && key, 'Set VLLM_BASE_URL and VLLM_API_KEY without placing credentials in command arguments.');
  const endpoint = new URL(base);
  assert(!endpoint.username && !endpoint.password, 'Credentials must be passed through VLLM_API_KEY.');
  const rejected = await fetch(`${base}/models`, { signal: AbortSignal.timeout(15_000) });
  assert([401, 403].includes(rejected.status), 'Inference must reject an unauthenticated request.');
  passed('vLLM rejects requests without authentication');
  const headers = { Authorization: `Bearer ${key}` };
  const models = await (await request(base, '/models', 200, 'GET', undefined, headers)).json();
  assert(models.data?.some(item => item.id === model), 'Configured model was not served.');
  passed('configured model is available through the authenticated API');
  const completion = await (await request(base, '/chat/completions', 200, 'POST', {
    model, temperature: 0, max_tokens: 256,
    messages: [{ role: 'user', content: 'Call report_catalog_health with category books. Do not answer in prose.' }],
    tools: [{ type: 'function', function: {
      name: 'report_catalog_health', description: 'Report a synthetic catalog category.',
      parameters: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'], additionalProperties: false },
    } }],
    tool_choice: { type: 'function', function: { name: 'report_catalog_health' } },
  }, headers)).json();
  const call = completion.choices?.[0]?.message?.tool_calls?.[0];
  assert.equal(call?.function?.name, 'report_catalog_health');
  assert.equal(JSON.parse(call.function.arguments).category, 'books');
  passed('real model produces a structured tool call with valid arguments');
  report.model = model;
  // Deliberately exclude provider responses, request headers and key material.
}

async function deployAndAccept() {
  assert(process.env.KUBECONFIG, 'Set KUBECONFIG to a dedicated local file before running --deploy.');
  assert.equal(run('docker', ['info', '--format', '{{.OSType}}']), 'linux', 'A running Linux Docker engine is required.');
  const clusters = run(kind, ['get', 'clusters']).split('\n');
  if (!clusters.includes(cluster)) {
    run(kind, ['create', 'cluster', '--name', cluster, '--image', nodeImage, '--wait', '120s']);
  }
  report.context = context;
  report.sourceCommit = run('git', ['rev-parse', 'HEAD']);
  report.workingTreeDirty = Boolean(run('git', ['status', '--porcelain']));
  report.kubernetes = JSON.parse(kubectl(['version', '-o', 'json'])).serverVersion.gitVersion;
  run('docker', ['build', '-t', image, '.'], { stdio: 'inherit' });
  report.imageId = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']);
  run(kind, ['load', 'docker-image', '--name', cluster, image], { stdio: 'inherit' });
  kubectl(['apply', '-f', '-'], { input: JSON.stringify({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }) });
  const secret = kubectl(['-n', namespace, 'get', 'secret', 'catalog-db', '--ignore-not-found', '-o', 'name']);
  if (!secret) {
    kubectl(['apply', '-f', '-'], { input: JSON.stringify({
      apiVersion: 'v1', kind: 'Secret', metadata: { name: 'catalog-db', namespace }, type: 'Opaque',
      stringData: { DATABASE_USER: 'catalog', DATABASE_PASSWORD: randomBytes(32).toString('hex') },
    }) });
  }
  const resources = kubectl(['kustomize', 'infra/kubernetes/application']).replaceAll('image: catalog-api:0.1.0', `image: ${image}`);
  kubectl(['apply', '-f', '-'], { input: resources });
  // Re-running the command must use the newly built image with the fixed demo tag.
  kubectl(['-n', namespace, 'rollout', 'restart', 'deployment/catalog-api']);
  kubectl(['-n', namespace, 'rollout', 'status', 'statefulset/postgres', '--timeout=180s']);
  kubectl(['-n', namespace, 'rollout', 'status', 'deployment/catalog-api', '--timeout=240s']);
  passed('PostgreSQL PVC and non-root API become Ready in Kubernetes');

  const port = Number(process.env.K8S_DEMO_PORT || 18080);
  assert(Number.isInteger(port) && port > 1024 && port < 65536, 'K8S_DEMO_PORT must be an unprivileged port.');
  const base = `http://127.0.0.1:${port}`;
  let forward;
  async function startForward() {
    forward = spawn('kubectl', ['--context', context, '-n', namespace, 'port-forward', 'service/catalog-api', `${port}:8080`, '--address=127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let failure = '';
    let listening = false;
    forward.stdout.on('data', data => { if (data.toString().includes(`Forwarding from 127.0.0.1:${port}`)) listening = true; });
    forward.stderr.on('data', data => { failure = `${failure}${data}`.slice(-2000); });
    forward.on('error', error => { failure = error.message; });
    for (let attempt = 0; attempt < 60; attempt++) {
      assert(forward.exitCode === null, `Port-forward exited: ${failure}`);
      try {
        if (!listening) { await delay(500); continue; }
        const result = await fetch(`${base}/actuator/health/readiness`, { signal: AbortSignal.timeout(1500) });
        if (result.ok && (await result.json()).status === 'UP') return;
      } catch { /* kubelet may still be establishing the forwarding stream. */ }
      await delay(500);
    }
    throw new Error(`API did not become reachable through port-forward: ${failure}`);
  }
  const locations = new Set();
  const prefix = `K8S-${randomUUID().slice(0, 8)}`;
  const category = `${prefix}-books`.toLowerCase();
  try {
    await startForward();
    assert.equal((await (await request(base, '/actuator/health', 200)).json()).status, 'UP');
    const spec = await (await request(base, '/v3/api-docs', 200)).json();
    assert(spec.paths['/api/products']);
    passed('readiness, database health and OpenAPI are reachable through the Service');
    const products = [];
    for (const [index, group] of [category, category, `${prefix}-games`.toLowerCase()].entries()) {
      const body = { sku: `${prefix}-${index}`, name: 'Synthetic Kubernetes product', category: group, price: 10.25 };
      const response = await request(base, '/api/products', 201, 'POST', body);
      const path = response.headers.get('location');
      assert(path?.startsWith('/api/products/'));
      locations.add(path);
      const loaded = await (await request(base, path, 200)).json();
      assert.equal(loaded.price, 10.25);
      products.push({ path, body });
    }
    passed('HTTP creation and database reads preserve synthetic products and decimal prices');
    await request(base, '/api/products', 409, 'POST', products[0].body);
    const invalid = await request(base, '/api/products', 400, 'POST', { ...products[0].body, sku: `${prefix}-invalid`, price: -1 });
    assert.match(invalid.headers.get('content-type'), /application\/problem\+json/);
    passed('duplicate SKU returns 409 and invalid price returns ProblemDetail 400');
    const first = await (await request(base, `/api/products?category=${encodeURIComponent(` ${category.toUpperCase()} `)}&size=1&page=0`, 200)).json();
    const second = await (await request(base, `/api/products?category=${category}&size=1&page=1`, 200)).json();
    assert.equal(first.totalElements, 2);
    assert.equal(first.totalPages, 2);
    assert.equal(first.content.length, 1);
    assert.equal(second.content.length, 1);
    assert.notEqual(first.content[0].id, second.content[0].id);
    const empty = await (await request(base, `/api/products?category=${prefix}-missing`, 200)).json();
    assert.equal(empty.totalElements, 0);
    await request(base, '/api/products?category=%20', 400);
    await request(base, '/api/products?category=', 400);
    await request(base, '/api/products?page=-1', 400);
    passed('category normalization, pagination, totals, empty results and invalid query parameters');
    const update = { ...products[0].body, name: 'Updated Kubernetes product', price: 14.50 };
    assert.equal((await (await request(base, products[0].path, 200, 'PUT', update)).json()).price, 14.50);
    forward.kill('SIGTERM');
    kubectl(['-n', namespace, 'rollout', 'restart', 'deployment/catalog-api']);
    kubectl(['-n', namespace, 'rollout', 'status', 'deployment/catalog-api', '--timeout=240s']);
    await startForward();
    assert.equal((await (await request(base, products[0].path, 200)).json()).name, update.name);
    passed('updates persist after the application Pod is replaced');
    await request(base, products[0].path, 204, 'DELETE');
    locations.delete(products[0].path);
    await request(base, products[0].path, 404);
    passed('HTTP deletion removes the product and subsequent lookup returns 404');
  } finally {
    const cleanup = await Promise.allSettled([...locations].map(path => request(base, path, 204, 'DELETE')));
    forward?.kill('SIGTERM');
    assert(cleanup.every(item => item.status === 'fulfilled'), 'Synthetic product cleanup failed.');
  }
  passed('synthetic fixtures are removed after the acceptance test');
  report.pods = JSON.parse(kubectl(['-n', namespace, 'get', 'pods', '-o', 'json'])).items.map(pod => ({
    name: pod.metadata.name, phase: pod.status.phase,
    ready: pod.status.conditions?.find(condition => condition.type === 'Ready')?.status === 'True',
  }));
  console.log(`Cluster preserved for the demo: ${context}. Cleanup: ${kind} delete cluster --name ${cluster}`);
}

try {
  if (mode === '--deploy') await deployAndAccept();
  else await inferencePreflight();
  report.status = 'passed';
} catch (error) {
  // Request bodies and inference responses are not included in this report.
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.durationSeconds = Math.round((Date.now() - started) / 1000);
  await mkdir('artifacts', { recursive: true });
  const path = mode === '--deploy' ? 'artifacts/kubernetes-acceptance.json' : 'artifacts/inference-preflight.json';
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Acceptance report: ${path}`);
}
