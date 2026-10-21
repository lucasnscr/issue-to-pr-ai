const { test } = require('node:test');
const assert = require('node:assert/strict');
const authorize = require('../../.github/scripts/authorize.cjs');

async function evaluate({ body = '/oc implement this', type = 'User', permission = 'write',
  labels = [{ name: 'ai:ready' }], state = 'open', fork = false, pr = false, login = 'maintainer' } = {}) {
  const outputs = {};
  await authorize({
    context: { actor: 'maintainer', repo: { owner: 'example', repo: 'catalog' },
      payload: { comment: { body, user: { type, login } }, issue: { number: 1 } } },
    core: { setOutput: (key, value) => { outputs[key] = value; }, notice: () => {} },
    github: { rest: {
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission } }) },
      issues: { get: async () => ({ data: { number: 1, state, labels, ...(pr ? { pull_request: {} } : {}) } }) },
      pulls: { get: async () => ({ data: { head: { repo: { full_name: fork ? 'outsider/catalog' : 'example/catalog' } } } }) },
    } },
  });
  return outputs.agent;
}

test('authorized collaborator can select either implementation agent', async () => {
  assert.equal(await evaluate(), 'opencode');
  assert.equal(await evaluate({ body: '/opencode implement' }), 'opencode');
  assert.equal(await evaluate({ body: '@claude implement' }), 'claude');
  assert.equal(await evaluate({ body: '  /OC implement' }), 'opencode');
});
test('mention inside ordinary prose or longer command cannot start a run', async () => {
  for (const body of ['Please /oc run', '/octopus run', '@claudette run']) {
    assert.equal(await evaluate({ body }), '');
  }
});
test('bots, spoofed actors and read-only collaborators cannot start runs', async () => {
  assert.equal(await evaluate({ type: 'Bot' }), '');
  assert.equal(await evaluate({ login: 'someone-else' }), '');
  assert.equal(await evaluate({ permission: 'read' }), '');
  assert.equal(await evaluate({ permission: 'triage' }), '');
});
test('ready label and open state are checked from current API state', async () => {
  assert.equal(await evaluate({ labels: [] }), '');
  assert.equal(await evaluate({ state: 'closed' }), '');
});
test('same-repository PRs are allowed and fork PRs are denied', async () => {
  assert.equal(await evaluate({ pr: true }), 'opencode');
  assert.equal(await evaluate({ pr: true, fork: true }), '');
});
