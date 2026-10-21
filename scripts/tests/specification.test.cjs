const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const spec = require('../../.github/scripts/specification.cjs');
const SHA = 'a'.repeat(40);
const proposal = { summary: 'Defina o comportamento do filtro antes de implementar.', status: 'needs-input',
  questions: [{ id: 'Q1', question: 'O filtro deve ignorar maiúsculas?', recommendation: 'Ignorar maiúsculas e manter acentos.', effect: 'Define normalização e os testes de banco.' }],
  proposedAcceptanceCriteria: ['Após confirmação, testar o comportamento escolhido com PostgreSQL.'] };
const telemetry = { profile: 'specification', model: 'anthropic/claude-sonnet-4-6', outcome: 'completed',
  policy: { decision: 'allow', reasons: [] }, usage: { complete: true, invalidUsageEvents: 0, steps: 1, startedSteps: 1, estimatedCostUsd: 0.01, policyTokenUnits: 100 } };

async function fixture(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-spec-'));
  const previousTemp = process.env.RUNNER_TEMP, previousSha = process.env.CHECKOUT_SHA;
  process.env.RUNNER_TEMP = directory; process.env.CHECKOUT_SHA = SHA;
  const issue = { number: 45, state: 'open', title: 'Adicionar filtro', body: '### Critérios de aceite\nFiltro de categoria.\n### Skills\nsuperpowers, postgres-flyway', labels: [] };
  const comment = { id: 150, body: '/ai-spec Refine os critérios.', user: { login: 'maintainer', type: 'User' }, issue_url: 'https://api.github.com/repos/example/catalog/issues/45' };
  const state = { issue, comment, permission: 'write', comments: [], posted: [], outputs: {} };
  const listComments = () => {};
  const github = { rest: { repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: state.permission } }), getCommit: async () => ({ data: { sha: SHA } }) },
    issues: { get: async () => ({ data: state.issue }), getComment: async () => ({ data: state.comment }), listComments,
      createComment: async options => { state.posted.push(options); return { data: {} }; } } },
    paginate: async method => { assert.equal(method, listComments); return state.comments; } };
  const context = { repo: { owner: 'example', repo: 'catalog' }, actor: 'maintainer', runId: 300,
    payload: { issue: { number: 45 }, comment: structuredClone(comment), repository: { default_branch: 'main' } } };
  const core = { setOutput: (key, value) => { state.outputs[key] = value; }, notice() {} };
  try { await callback({ directory, state, github, context, core }); }
  finally {
    for (const [key, value] of [['RUNNER_TEMP', previousTemp], ['CHECKOUT_SHA', previousSha]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function generate(s, { response = proposal, usage = telemetry, inspect = () => {} } = {}) {
  const { runSpecification } = await import('../run-specification.mjs');
  return runSpecification({ env: { MODEL: 'anthropic/claude-sonnet-4-6', SPEC_DIRECTORY: s.state.outputs.directory,
    ANTHROPIC_API_KEY: 'FAKE_PROVIDER_KEY', GH_TOKEN: 'FAKE_GITHUB_KEY', AWS_SECRET_ACCESS_KEY: 'FAKE_AWS_KEY' },
    outputDirectory: s.directory + '/output', run: async (args, options) => {
      inspect(args, options);
      if (usage) fs.writeFileSync(options.usageFile, JSON.stringify(usage));
      return { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: JSON.stringify(response) } }), usage };
    } });
}

test('authorized specification produces bounded questions and a comment without modifying the issue or starting code', () => fixture(async s => {
  await spec.prepare(s);
  assert.equal(s.state.outputs.ready, 'true');
  const original = structuredClone(s.state.issue);
  await generate(s, { inspect: (args, options) => {
    assert(args[1].includes('name: grill-me'));
    assert(args[1].includes('name: superpowers'));
    assert(args[1].includes('/ai-spec Refine os critérios.'));
    assert.equal(args[args.indexOf('--agent') + 1], 'specifier');
    assert.equal(options.profile, 'specification');
    assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(options.env.ANTHROPIC_API_KEY, 'FAKE_PROVIDER_KEY');
  } });
  await spec.publish({ ...s, directory: s.state.outputs.directory, outputDirectory: s.directory + '/output' });
  assert.equal(s.state.posted.length, 1);
  assert.match(s.state.posted[0].body, /continuous-ai-spec:150/);
  assert.match(s.state.posted[0].body, /não altera a issue nem inicia implementação/);
  assert.match(s.state.posted[0].body, /Critérios propostos/);
  assert.deepEqual(s.state.issue, original);
}));

test('bots, unrelated commands and read-only actors cannot request specification', async () => {
  for (const change of ['bot', 'other-command', 'reader', 'pr', 'closed']) await fixture(async s => {
    if (change === 'bot') s.context.payload.comment.user.type = 'Bot';
    if (change === 'other-command') s.context.payload.comment.body = '/ai-spec-malicious';
    if (change === 'reader') s.state.permission = 'read';
    if (change === 'pr') s.state.issue.pull_request = {};
    if (change === 'closed') s.state.issue.state = 'closed';
    if (['bot', 'other-command'].includes(change)) await spec.prepare(s);
    else await assert.rejects(spec.prepare(s), /Write access|open issue/);
    assert.equal(s.state.outputs.ready, 'false'); assert.equal(s.state.posted.length, 0);
  });
});

test('unknown selection and a moved trusted base stop preparation', async () => {
  await fixture(async s => {
    s.state.issue.body += '\nunknown-skill';
    await assert.rejects(spec.prepare(s), /Unknown skill/);
    assert.equal(s.state.outputs.ready, 'false');
  });
  await fixture(async s => {
    process.env.CHECKOUT_SHA = 'b'.repeat(40);
    await assert.rejects(spec.prepare(s), /base moved/);
  });
});

test('result schema rejects excessive questions and contradictory readiness without silently accepting answers', () => {
  assert.deepEqual(spec.validateResult(proposal), proposal);
  for (const value of [{ ...proposal, questions: Array(6).fill(proposal.questions[0]) },
    { ...proposal, status: 'draft-ready' }, { ...proposal, questions: [] },
    { ...proposal, proposedAcceptanceCriteria: ['x'.repeat(601)] },
    { ...proposal, questions: [{ ...proposal.questions[0], effect: '' }] }]) assert.throws(() => spec.validateResult(value), /Invalid structured/);
  const ready = { summary: 'Critérios completos fornecidos pelo responsável.', status: 'draft-ready', questions: [], proposedAcceptanceCriteria: ['Manter o contrato informado.'] };
  assert.deepEqual(spec.validateResult(ready), ready);
});

test('publisher discards stale inputs, revoked permissions and closed issues before commenting', async () => {
  for (const change of ['issue', 'comment', 'permission', 'closed']) await fixture(async s => {
    await spec.prepare(s); await generate(s);
    if (change === 'issue') s.state.issue.body += '\nEscopo atualizado.';
    if (change === 'comment') s.state.comment.body += '\nOutra decisão.';
    if (change === 'permission') s.state.permission = 'read';
    if (change === 'closed') s.state.issue.state = 'closed';
    await assert.rejects(spec.publish({ ...s, directory: s.state.outputs.directory, outputDirectory: s.directory + '/output' }), /stale|Write access|open issue/);
    assert.equal(s.state.posted.length, 0);
  });
});

test('specification round is idempotent and only trusts the publisher bot marker', () => fixture(async s => {
  s.state.comments.push({ user: { login: 'other-user', type: 'User' }, body: '<!-- continuous-ai-spec:150 -->' });
  await spec.prepare(s); await generate(s);
  await spec.publish({ ...s, directory: s.state.outputs.directory, outputDirectory: s.directory + '/output' });
  s.state.comments.push({ user: { login: 'github-actions[bot]', type: 'Bot' }, body: s.state.posted[0].body });
  await spec.publish({ ...s, directory: s.state.outputs.directory, outputDirectory: s.directory + '/output' });
  assert.equal(s.state.posted.length, 1);
  await spec.prepare(s); assert.equal(s.state.outputs.ready, 'false');
}));

test('missing, blocked or malformed telemetry cannot publish a specification', async () => {
  for (const usage of [null, { ...telemetry, outcome: 'blocked' }, { ...telemetry, usage: { ...telemetry.usage, complete: false } },
    { ...telemetry, usage: { ...telemetry.usage, estimatedCostUsd: 2 } }]) await fixture(async s => {
    await spec.prepare(s);
    await assert.rejects(generate(s, { usage }), /usage|USAGE_UNAVAILABLE|COST_LIMIT/);
    assert(!fs.existsSync(s.directory + '/output/specification.json'));
    assert.equal(s.state.posted.length, 0);
  });
});

test('model output cannot inject publisher markers or mention people', () => {
  const manifest = require('../skills.cjs').bundle({ phases: ['specification'] }).manifest;
  const body = spec.render({ ...proposal, summary: '<!-- continuous-ai-spec:99 --> @maintainer [click](https://invalid)' }, manifest);
  assert(!body.includes('<!-- continuous-ai-spec:99 -->'));
  assert(!body.includes('@maintainer'));
  assert(body.includes('&lt;!--'));
});
