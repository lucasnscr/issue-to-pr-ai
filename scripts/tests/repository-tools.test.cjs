const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function modules() {
  const [config, bootstrap, doctor, metadata] = await Promise.all([
    import('../repository-config.mjs'), import('../bootstrap-repository.mjs'), import('../repository-doctor.mjs'), import('../github-metadata.mjs'),
  ]);
  return { ...config, ...bootstrap, ...doctor, ...metadata };
}

function state(config) {
  return { repo: { default_branch: 'main', is_template: true, description: 'Reference', topics: ['custom'] },
    protection: { required_status_checks: { strict: true, contexts: ['Repository checks', 'Build and tests', 'AI review gate'] },
      enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } },
    variables: { total_count: 4, variables: ['AI_ENABLED', 'AI_SPEC_ENABLED', 'AI_REVIEW_ENABLED', 'AI_LOOP_ENABLED'].map(name => ({ name, value: 'true' })) },
    secrets: { total_count: 1, secrets: [{ name: 'ANTHROPIC_API_KEY' }] }, labels: config.github.labels,
    workflowPermissions: { can_approve_pull_request_reviews: true }, unavailable: [] };
}

test('bootstrap preview is read-only, explicit about its target and never activates agents or reduces protection', async () => {
  const { bootstrap } = await modules();
  const result = bootstrap({ repository: 'example/catalog', api: () => assert.fail('Preview cannot contact or mutate GitHub.') });
  assert.equal(result.mode, 'preview'); assert.equal(result.repository, 'example/catalog'); assert.equal(result.settings.is_template, true);
  assert.equal(result.settings.homepage, 'https://github.com/example/catalog/blob/main/docs/README.md');
  assert(!Object.hasOwn(result.settings, 'visibility')); assert(!Object.hasOwn(result.settings, 'default_branch'));
  assert(!JSON.stringify(result.settings).includes('AI_ENABLED'));
  assert.equal(bootstrap({ repository: 'example/catalog', apply: 'false', api: () => assert.fail('Only boolean true can apply.') }).mode, 'preview');
  for (const repository of [undefined, 'owner/repo;echo token', 'https://github.com/owner/repo', '../private']) assert.throws(() => bootstrap({ repository }), /explicit/);
});

test('bootstrap preserves unrelated labels/topics and retries idempotently without touching AI variables or permissions', async () => {
  const { bootstrap, loadRepositoryConfig } = await modules();
  const config = loadRepositoryConfig();
  const labels = [{ name: 'custom', color: 'aaaaaa', description: 'Preserved' }, { name: 'ai:ready', color: 'ffffff', description: 'Old description' }], calls = [];
  const current = { topics: ['custom'], description: '' };
  const api = (route, options = {}) => {
    calls.push({ route, ...options });
    if (!options.method) return route.endsWith('/labels?per_page=100') ? structuredClone(labels) : structuredClone(current);
    if (route.endsWith('/labels') && options.method === 'POST') labels.push(options.data);
    else if (route.includes('/labels/')) Object.assign(labels.find(l => l.name === decodeURIComponent(route.split('/').pop())), options.data);
    else if (route.endsWith('/topics')) current.topics = options.data.names;
    else Object.assign(current, options.data);
    return {};
  };
  bootstrap({ repository: 'example/catalog', apply: true, config, api });
  assert(labels.some(l => l.name === 'custom')); assert(current.topics.includes('custom'));
  assert.equal(labels.length, config.github.labels.length + 1);
  const patch = calls.find(c => c.route.endsWith('/labels/ai%3Aready'));
  assert.equal(patch.method, 'PATCH'); assert.deepEqual(Object.keys(patch.data).sort(), ['color', 'description']);
  const before = calls.length;
  bootstrap({ repository: 'example/catalog', apply: true, config, api });
  assert(!calls.slice(before).some(c => c.method && c.route.includes('/labels')));
  assert(!calls.some(c => /secrets|variables|protection|permissions/.test(c.route)));
  assert.deepEqual(current.topics, [...new Set(current.topics)].sort());
});

test('incomplete metadata, missing access and excessive topic union fail before the first bootstrap write', async () => {
  const { bootstrap } = await modules();
  for (const mode of ['labels', 'topics', 'access']) {
    const calls = [];
    assert.throws(() => bootstrap({ repository: 'example/catalog', apply: true, api: (route, options = {}) => {
      calls.push(options.method);
      if (mode === 'access') throw new Error('Unavailable.');
      if (route.includes('/labels?')) return mode === 'labels' ? Array(100).fill({ name: 'custom' }) : [];
      return { topics: mode === 'topics' ? Array.from({ length: 20 }, (_, i) => `custom-${i}`) : [] };
    } }));
    assert(calls.every(method => method === undefined));
  }
});

test('doctor distinguishes configuration readiness from an executed model or passing application', async () => {
  const { checkGithub, loadRepositoryConfig } = await modules(); const config = loadRepositoryConfig();
  const policy = require('../../config/ai-policy.json'), protection = require('../../config/branch-protection.json');
  const options = { config, policy, protection, profile: 'all' };
  assert(checkGithub(state(config), options).every(c => c.status === 'pass'));
  const disabled = state(config); disabled.variables.variables = disabled.variables.variables.filter(v => v.name !== 'AI_SPEC_ENABLED');
  const result = checkGithub(disabled, options);
  assert(result.some(c => c.id === 'specification-enabled' && c.status === 'fail'));
  assert(result.some(c => c.id === 'implementation-enabled' && c.status === 'pass'));
  assert(!result.some(c => c.id.includes('execution') || c.id.includes('tests-passed')));
});

test('doctor blocks unavailable or weakened branch checks and missing provider metadata without printing secret-like values', async () => {
  const { checkGithub, loadRepositoryConfig } = await modules(); const config = loadRepositoryConfig();
  const options = { config, policy: require('../../config/ai-policy.json'), protection: require('../../config/branch-protection.json'), profile: 'review' };
  for (const mode of ['unavailable', 'missing-check', 'admin', 'force', 'unknown-force']) {
    const github = state(config);
    if (mode === 'unavailable') delete github.protection;
    if (mode === 'missing-check') github.protection.required_status_checks.contexts.pop();
    if (mode === 'admin') github.protection.enforce_admins.enabled = false;
    if (mode === 'force') github.protection.allow_force_pushes.enabled = true;
    if (mode === 'unknown-force') delete github.protection.allow_force_pushes;
    assert(checkGithub(github, options).some(c => c.id === 'branch-protection' && c.status === 'fail'));
  }
  const github = state(config);
  github.variables.variables.push({ name: 'REVIEW_MODEL', value: 'FAKE_SECRET_MUST_NOT_PRINT' });
  assert(!JSON.stringify(checkGithub(github, options)).includes('FAKE_SECRET'));
  delete github.secrets;
  assert(checkGithub(github, options).some(c => c.id === 'ai-metadata' && c.status === 'fail'));
});

test('private vLLM readiness needs both its credential name and endpoint while Claude remains Anthropic-only', async () => {
  const { checkGithub, loadRepositoryConfig } = await modules(); const config = loadRepositoryConfig();
  const options = { config, policy: require('../../config/ai-policy.json'), protection: require('../../config/branch-protection.json'), profile: 'implementation' };
  const github = state(config);
  github.variables.variables.push({ name: 'OPENCODE_MODEL', value: 'vllm/qwen-coder' });
  assert(checkGithub(github, options).some(c => c.id === 'implementation-credential-name' && c.status === 'fail'));
  github.secrets.secrets.push({ name: 'VLLM_API_KEY' }); github.variables.variables.push({ name: 'VLLM_BASE_URL', value: 'http://synthetic.invalid/v1' });
  assert(checkGithub(github, options).every(c => c.status === 'pass'));
  github.variables.variables.push({ name: 'CLAUDE_ENABLED', value: 'true' }, { name: 'CLAUDE_MODEL', value: 'vllm/qwen-coder' });
  assert(checkGithub(github, { ...options, profile: 'claude' }).some(c => c.id === 'claude-model' && c.status === 'fail'));
});

test('metadata collector uses GET routes only and tolerates denied access without copying API errors', async () => {
  const { collectGithubMetadata } = await modules(); const calls = [];
  const github = collectGithubMetadata('example/catalog', route => {
    calls.push(route);
    if (route === 'repos/example/catalog') return { default_branch: 'main' };
    throw new Error('FAKE_TOKEN_FROM_RAW_ERROR');
  });
  assert(calls.includes('repos/example/catalog/actions/secrets?per_page=100'));
  assert(github.unavailable.includes('secrets'));
  assert(!JSON.stringify(github).includes('FAKE_TOKEN'));
  assert.throws(() => collectGithubMetadata('invalid/../repo', () => assert.fail()), /explicit/);
});

test('tool probes are bounded read-only commands and failures cannot become a verified execution', async () => {
  const { checkTools } = await modules(); const commands = [];
  const checks = checkTools((command, args) => { commands.push([command, args]); return { node: 'v22.21.1', java: 'openjdk 21.0.9', python3: 'Python 3.13.0', docker: '28.0.1' }[command]; });
  assert(checks.every(c => c.status === 'pass'));
  assert(commands.every(([command]) => ['node', 'java', 'python3', 'docker'].includes(command)));
  assert(checkTools(() => { throw new Error('Raw secret'); }).every(c => c.status === 'fail' && !c.message.includes('Raw secret')));
});

test('unsafe paths and duplicate labels are rejected in repository configuration', async () => {
  const { loadRepositoryConfig } = await modules();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-config-'));
  try {
    fs.mkdirSync(path.join(root, 'config')); const original = loadRepositoryConfig();
    const write = config => fs.writeFileSync(path.join(root, 'config/repository.json'), JSON.stringify(config));
    write({ ...original, paths: { application: '../../private' } }); assert.throws(() => loadRepositoryConfig(root), /Invalid/);
    write({ ...original, paths: {} }); assert.throws(() => loadRepositoryConfig(root), /Invalid/);
    write({ ...original, github: { ...original.github, labels: [original.github.labels[0], original.github.labels[0]] } }); assert.throws(() => loadRepositoryConfig(root), /duplicate/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('source doctor reports its scope explicitly and an AI profile without GitHub remains unverified', async () => {
  const { repositoryDoctor } = await modules();
  const local = repositoryDoctor();
  assert.equal(local.status, 'pass'); assert.equal(local.scope, 'source-configuration'); assert.equal(local.executionVerified, false);
  const ai = repositoryDoctor({ profile: 'all' });
  assert.equal(ai.status, 'warn'); assert.equal(ai.ready, false); assert.equal(ai.executionVerified, false);
});

test('historical issue seeding cannot call GitHub by accident on the already-completed reference exercises', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../seed-demo-issues.mjs'), '--create', '--repo', 'example/catalog'],
    { encoding: 'utf8', env: { ...process.env, PATH: '' } });
  assert.notEqual(result.status, 0);
  assert(result.stderr.includes('--acknowledge-historical'));
});
