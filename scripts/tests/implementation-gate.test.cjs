const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('../../.github/scripts/prepare-implementation.cjs');

const sha = 'a'.repeat(40);
const item = { number: 8, title: 'Price range', body: 'Inclusive BigDecimal ranges.', state: 'open', labels: [{ name: 'ai:ready' }] };
async function evaluate({ permission = 'write', issue = item, checkout = sha, current = sha } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'implementation-gate-'));
  const previous = { RUNNER_TEMP: process.env.RUNNER_TEMP, CHECKOUT_SHA: process.env.CHECKOUT_SHA };
  Object.assign(process.env, { RUNNER_TEMP: directory, CHECKOUT_SHA: checkout });
  const outputs = {};
  try {
    await prepare({ context: { repo: { owner: 'example', repo: 'catalog' }, actor: 'maintainer', runId: 42,
      payload: { issue: { number: 8 }, repository: { default_branch: 'main' } } },
      core: { setOutput: (key, value) => { outputs[key] = value; } },
      github: { rest: { repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission } }),
        getCommit: async () => ({ data: { sha: current } }),
      }, issues: { get: async () => ({ data: issue }) } } } });
    return { outputs, task: fs.readFileSync(outputs.task, 'utf8'), skills: JSON.parse(fs.readFileSync(outputs.skills_manifest)) };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('authorized issue produces a bounded task and immutable base for publication', async () => {
  const { outputs, task } = await evaluate();
  assert.equal(outputs.base_ref, 'main');
  assert.equal(outputs.base_sha, sha);
  assert.equal(outputs.branch, 'ai/issue-8-42');
  assert(task.includes(item.body));
  assert(task.includes('do not commit, push, create PRs'));
});
test('revoked access, removed label, closed issue and PR tasks fail before inference', async () => {
  await assert.rejects(evaluate({ permission: 'read' }), /Write access/);
  for (const issue of [{ ...item, labels: [] }, { ...item, state: 'closed' }, { ...item, pull_request: {} }]) {
    await assert.rejects(evaluate({ issue }), /open issue/);
  }
});
test('moving base and oversized or missing task content fail closed', async () => {
  await assert.rejects(evaluate({ current: 'b'.repeat(40) }), /branch moved/);
  await assert.rejects(evaluate({ issue: { ...item, body: '' } }), /description/);
  await assert.rejects(evaluate({ issue: { ...item, body: 'x'.repeat(20001) } }), /description/);
});
test('implementation captures the issue-selected skills and phase-specific provenance before inference', async () => {
  const body = item.body + '\n### Skills\nsuperpower, graphify, postgres-flyway, grill-me';
  const result = await evaluate({ issue: { ...item, body } });
  assert.deepEqual(JSON.parse(result.outputs.selected_skills), ['graphify', 'grill-me', 'postgres-flyway', 'superpowers']);
  assert.equal(result.outputs.graphify, 'true');
  assert.equal(result.skills.catalogCommit, sha);
  assert.deepEqual(result.skills.phases, ['implementation', 'testing']);
  assert(result.task.includes('name: postgres-flyway'));
  assert(result.task.includes('name: superpowers'));
  assert(!result.task.includes('name: grill-me'));
  await assert.rejects(evaluate({ issue: { ...item, body: item.body + '\n### Skills\n../../secrets' } }), /IDs/);
});
