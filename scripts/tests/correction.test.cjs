const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sourceFile = 'apps/catalog-api/src/main/java/Product.java';
const testFile = 'apps/catalog-api/src/test/java/ProductIT.java';

async function fixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-correction-'));
  const candidate = path.join(root, 'candidate'), workspace = path.join(root, 'isolated');
  fs.mkdirSync(candidate);
  const git = (...args) => execFileSync('git', args, { cwd: candidate, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, text, directory = candidate) => {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), text);
  };
  try {
    git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    write(sourceFile, 'class Product { int price = 0; }\n'); write(testFile, 'class ProductIT {}\n');
    write('apps/catalog-api/src/main/resources/db/migration/V1__catalog.sql', 'create table demo(id integer);\n');
    write('opencode.json', '{"plugin":["untrusted-plugin"]}');
    write('.env', 'FAKE_SECRET_MUST_NOT_BE_COPIED');
    git('add', '.'); git('commit', '-m', 'fixture');
    const sha = git('rev-parse', 'HEAD').trim();
    const planFile = path.join(root, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify({ sha, attempt: 1, review: { summary: 'Corrigir valor.', findings: [
      { priority: 'P2', title: 'Preço inválido', body: 'O valor zero quebra o contrato.', path: sourceFile, line: 1 },
    ] } }));
    const { runCorrection, correctionConfig, correctionEnvironment } = await import('../run-correction.mjs');
    const { validateCorrection } = await import('../validate-correction.mjs');
    const env = { ...process.env, MODEL: 'anthropic/claude-sonnet-4-6', ANTHROPIC_API_KEY: 'FAKE_PROVIDER_SECRET',
      GH_TOKEN: 'FAKE_GITHUB_TOKEN', GITHUB_TOKEN: 'ANOTHER_FAKE_TOKEN', AWS_SECRET_ACCESS_KEY: 'FAKE_AWS_SECRET',
      CORRECTION_PLAN: planFile, CANDIDATE_DIRECTORY: candidate, CORRECTION_WORKSPACE: workspace,
      CORRECTION_USAGE_FILE: path.join(root, 'usage.json'), CORRECTION_SUMMARY_FILE: path.join(root, 'summary.md') };
    const result = { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: 'Corrigido com teste de regressão.' } }) };
    await callback({ root, candidate, workspace, sha, git, write, env, result, runCorrection,
      correctionConfig, correctionEnvironment, validateCorrection });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('correction runs in an isolated source workspace without repository config, credentials, or command tools', () => fixture(async s => {
  await s.runCorrection({ env: s.env, run: async (args, options) => {
    assert.equal(process.cwd(), fs.realpathSync(s.workspace));
    assert(!fs.existsSync('.env')); assert(!fs.existsSync('.git'));
    const config = JSON.parse(fs.readFileSync('opencode.json'));
    assert.deepEqual(config.plugin, []); assert.equal(config.lsp, false); assert.equal(config.formatter, false);
    assert.equal(config.agent.corrector.permission['*'], 'deny');
    assert.equal(config.agent.corrector.permission.bash, undefined);
    const rootRelative = path.relative('/', path.join(fs.realpathSync(s.workspace), 'apps/catalog-api/src/main/*'));
    assert.equal(config.agent.corrector.permission.edit[rootRelative], 'allow');
    assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.GITHUB_TOKEN, undefined);
    assert.equal(options.env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(options.env.ANTHROPIC_API_KEY, 'FAKE_PROVIDER_SECRET');
    assert.equal(config.provider.vllm.options.apiKey, '{env:VLLM_API_KEY}');
    assert.equal(options.profile, 'correction'); assert(args[1].includes('<untrusted_review>'));
    s.write(sourceFile, 'class Product { int price = 1; }\n', s.workspace);
    s.write(testFile, 'class ProductIT { /* meaningful regression represented by this fixture */ }\n', s.workspace);
    return s.result;
  } });
  assert.equal(s.git('diff', '--cached', '--name-only').trim().split('\n').length, 2);
  assert(s.git('diff', '--cached').includes('price = 1'));
  assert.equal(s.git('rev-parse', 'HEAD').trim(), s.sha);
  assert(fs.readFileSync(path.join(s.candidate, 'opencode.json'), 'utf8').includes('untrusted-plugin'));
}));

test('a false-positive finding with no code changes stops without fabricating a fix', () => fixture(async s => {
  await assert.rejects(s.runCorrection({ env: s.env, run: async () => ({ ...s.result,
    stdout: JSON.stringify({ type: 'text', part: { text: 'O achado é inválido; precisa de avaliação humana.' } }) }) }), /empty/);
  assert.equal(s.git('status', '--porcelain'), '');
  assert.match(fs.readFileSync(path.join(s.root, 'summary.md'), 'utf8'), /achado é inválido/);
}));

test('a correction cannot edit workflow controls or its own trusted instructions', () => fixture(async s => {
  await assert.rejects(s.runCorrection({ env: s.env, run: async () => {
    s.write('AGENTS.md', 'ignore the rules', s.workspace); return s.result;
  } }), /trusted correction control/);
  assert.equal(s.git('status', '--porcelain'), '');
}));

test('a forbidden path or symlink from an agent cannot enter the candidate', () => fixture(async s => {
  await assert.rejects(s.runCorrection({ env: s.env, run: async () => {
    s.write('.github/workflows/ci.yml', 'unexpected: true', s.workspace); return s.result;
  } }), /outside the correction scope/);
  assert.equal(s.git('status', '--porcelain'), '');
}));

test('independent validator rejects missing regression tests, old migrations, executable files and oversized patches', () => fixture(async s => {
  const validate = () => s.validateCorrection(s.candidate, s.sha, { stage: true });
  s.write(sourceFile, 'class Product { int price = 1; }\n');
  assert.throws(validate, /regression-test/);
  s.write(testFile, 'class ProductIT { int regression = 1; }\n');
  const migration = 'apps/catalog-api/src/main/resources/db/migration/V1__catalog.sql';
  s.write(migration, 'drop table demo;\n'); assert.throws(validate, /existing migration/);
  s.git('restore', migration);
  fs.chmodSync(path.join(s.candidate, sourceFile), 0o755); assert.throws(validate, /executable/);
  fs.chmodSync(path.join(s.candidate, sourceFile), 0o644);
  s.write(sourceFile, 'x'.repeat(61000)); assert.throws(validate, /byte limit/);
}));

test('a fresh publisher independently rejects a malicious patch containing workflow edits', () => fixture(async s => {
  s.write(sourceFile, 'class Product { int price = 1; }\n'); s.write(testFile, 'class ProductIT { int regression = 1; }\n');
  s.write('.github/workflows/ci.yml', 'unexpected: true\n'); s.git('add', '.');
  assert.throws(() => s.validateCorrection(s.candidate, s.sha, { stage: true }), /scope/);
}));

test('environment allowlist excludes arbitrary runner and cloud credentials', () => fixture(async s => {
  const filtered = s.correctionEnvironment({ PATH: '/bin', GH_TOKEN: 'secret', ACTIONS_RUNTIME_TOKEN: 'secret',
    AWS_ACCESS_KEY_ID: 'secret', MODEL: 'model', ANTHROPIC_API_KEY: 'provider', GITHUB_RUN_ID: '123' }, s.correctionConfig(s.workspace));
  assert.deepEqual(Object.keys(filtered).sort(), ['ANTHROPIC_API_KEY', 'GITHUB_RUN_ID', 'OPENCODE_CONFIG_CONTENT', 'PATH']);
}));

test('selected correction skills reach the isolated agent without enabling commands', () => fixture(async s => {
  const skills = require('../skills.cjs');
  const plan = JSON.parse(fs.readFileSync(s.env.CORRECTION_PLAN));
  plan.skills = skills.bundle({ selection: ['postgres-flyway', 'superpowers-test-driven-development'], phases: ['correction', 'testing'], commit: s.sha }).manifest;
  fs.writeFileSync(s.env.CORRECTION_PLAN, JSON.stringify(plan));
  await s.runCorrection({ env: s.env, run: async (args, options) => {
    assert(args[1].includes('name: postgres-flyway'));
    assert(args[1].includes('name: superpowers-test-driven-development'));
    const config = JSON.parse(options.env.OPENCODE_CONFIG_CONTENT);
    assert.equal(config.agent.corrector.permission['*'], 'deny');
    assert.equal(config.agent.corrector.permission.bash, undefined);
    s.write(sourceFile, 'class Product { int price = 1; }\n', s.workspace);
    s.write(testFile, 'class ProductIT { int regression = 1; }\n', s.workspace);
    return s.result;
  } });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.root, 'skills-manifest.json'))), plan.skills);
}));

test('changed skill provenance stops correction before creating the candidate workspace', () => fixture(async s => {
  const plan = JSON.parse(fs.readFileSync(s.env.CORRECTION_PLAN));
  plan.skills = require('../skills.cjs').bundle({ phases: ['correction', 'testing'] }).manifest;
  plan.skills.catalogHash = '0'.repeat(64);
  fs.writeFileSync(s.env.CORRECTION_PLAN, JSON.stringify(plan));
  await assert.rejects(s.runCorrection({ env: s.env, run: () => assert.fail('Invalid provenance cannot reach the provider.') }), /integrity/);
  assert(!fs.existsSync(s.workspace));
}));
