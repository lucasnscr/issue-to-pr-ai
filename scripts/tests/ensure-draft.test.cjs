const { test } = require('node:test');
const assert = require('node:assert/strict');
const ensureDraft = require('../../.github/scripts/ensure-draft.cjs');

const repository = { full_name: 'example/catalog' };
const pull = { number: 7, node_id: 'PR_7', state: 'open', draft: false,
  head: { ref: 'opencode/issue1', repo: repository }, base: { repo: repository } };

async function evaluate({ branch = pull.head.ref, pulls = [pull] } = {}) {
  const outputs = {};
  const mutations = [];
  const lists = [];
  await ensureDraft({
    context: { repo: { owner: 'example', repo: 'catalog' }, payload: { repository: { default_branch: 'main' } } },
    core: { setOutput: (key, value) => { outputs[key] = value; }, notice() {} },
    getHeadBranch: () => branch,
    github: { rest: { pulls: { list() {} } },
      paginate: async (_, params) => { lists.push(params); return pulls; },
      graphql: async (query, variables) => { mutations.push({ query, variables }); },
    },
  });
  return { outputs, mutations, lists };
}

test('a ready PR for the current same-repository branch is converted to draft', async () => {
  const result = await evaluate();
  assert.equal(result.outputs['pull-request'], '7');
  assert.equal(result.mutations.length, 1);
  assert.match(result.mutations[0].query, /convertPullRequestToDraft/);
  assert.deepEqual(result.mutations[0].variables, { pullRequestId: 'PR_7' });
  assert.deepEqual(result.lists[0], { owner: 'example', repo: 'catalog',
    head: 'example:opencode/issue1', state: 'open', per_page: 100 });
});

test('an existing draft PR does not produce another mutation', async () => {
  const result = await evaluate({ pulls: [{ ...pull, draft: true }] });
  assert.equal(result.outputs['pull-request'], '7');
  assert.equal(result.mutations.length, 0);
});

test('absence of a PR, a detached HEAD, or the default branch is a safe no-op', async () => {
  const missing = await evaluate({ pulls: [] });
  assert.equal(missing.outputs['pull-request'], '');
  assert.equal(missing.mutations.length, 0);
  for (const branch of ['', 'main']) {
    const result = await evaluate({ branch });
    assert.equal(result.outputs['pull-request'], '');
    assert.equal(result.lists.length, 0);
    assert.equal(result.mutations.length, 0);
  }
});

test('forks, other branches, closed PRs and another base repository are never changed', async () => {
  const pulls = [
    { ...pull, head: { ...pull.head, repo: { full_name: 'outsider/catalog' } } },
    { ...pull, head: { ...pull.head, ref: 'another-branch' } },
    { ...pull, state: 'closed' },
    { ...pull, base: { repo: { full_name: 'another/catalog' } } },
  ];
  const result = await evaluate({ pulls });
  assert.equal(result.outputs['pull-request'], '');
  assert.equal(result.mutations.length, 0);
});

test('multiple matching PRs fail without choosing an arbitrary PR', async () => {
  await assert.rejects(evaluate({ pulls: [pull, { ...pull, number: 8, node_id: 'PR_8' }] }),
    /More than one PR matches/);
});
