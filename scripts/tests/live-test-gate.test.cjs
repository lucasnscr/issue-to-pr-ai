const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('../../.github/scripts/prepare-live-test.cjs');

const sha = 'a'.repeat(40);
const issue = { number: 4, title: 'Filter products by category', state: 'open',
  labels: [{ name: 'ai:ready' }], body: 'Add category filtering with pagination and PostgreSQL tests.' };

async function evaluate({ permission = 'write', baseSha = sha, eventSha = sha,
  item = issue, number = '4', baseRef = 'feat/bootstrap' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-to-pr-live-gate-'));
  const values = { RUNNER_TEMP: directory, LIVE_TEST_ISSUE: number, LIVE_TEST_BASE_REF: baseRef };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const outputs = {};
  const requests = [];
  try {
    await prepare({
      context: { repo: { owner: 'example', repo: 'catalog' }, actor: 'maintainer', sha: eventSha, runId: 123 },
      core: { setOutput: (key, value) => { outputs[key] = value; } },
      github: { rest: {
        repos: {
          getCollaboratorPermissionLevel: async params => {
            requests.push({ operation: 'access', ...params });
            return { data: { permission } };
          },
          getCommit: async params => {
            requests.push({ operation: 'commit', ...params });
            return { data: { sha: baseSha } };
          },
        },
        issues: { get: async params => {
          requests.push({ operation: 'issue', ...params });
          return { data: item };
        } },
      } },
    });
    return { outputs, requests, task: fs.readFileSync(outputs.task, 'utf8') };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('a writer can authorize only the exact base commit and selected ready issue', async () => {
  for (const permission of ['write', 'maintain', 'admin']) {
    const result = await evaluate({ permission });
    assert.equal(result.outputs.issue, '4');
    assert.equal(result.outputs.base_ref, 'feat/bootstrap');
    assert.equal(result.outputs.base_sha, sha);
    assert.equal(result.outputs.branch, 'ai/issue-4-123');
    assert.deepEqual(result.requests, [
      { operation: 'access', owner: 'example', repo: 'catalog', username: 'maintainer' },
      { operation: 'commit', owner: 'example', repo: 'catalog', ref: 'feat/bootstrap' },
      { operation: 'issue', owner: 'example', repo: 'catalog', issue_number: 4 },
    ]);
    assert(result.task.includes(issue.body));
    assert(result.task.includes('Do not commit, push, create PRs'));
  }
});

test('read-only, triage and missing actor permissions cannot authorize inference', async () => {
  for (const permission of ['read', 'triage', 'none', undefined]) {
    // Undefined defaults to write in evaluate; use null for the missing API field.
    await assert.rejects(evaluate({ permission: permission ?? null }), /Write access is required/);
  }
});

test('a branch that moved or a test SHA different from the selected base is rejected', async () => {
  await assert.rejects(evaluate({ baseSha: 'b'.repeat(40) }), /exact base branch commit/);
  await assert.rejects(evaluate({ eventSha: 'c'.repeat(40) }), /exact base branch commit/);
});

test('pull requests cannot be selected as live-test issues', async () => {
  await assert.rejects(evaluate({ item: { ...issue, pull_request: { url: 'https://example.invalid/pr/4' } } }),
    /must be an open issue labeled ai:ready/);
});

test('the selected issue must remain open and labeled ai:ready', async () => {
  await assert.rejects(evaluate({ item: { ...issue, state: 'closed' } }), /must be an open issue/);
  await assert.rejects(evaluate({ item: { ...issue, labels: [] } }), /must be an open issue/);
  await assert.rejects(evaluate({ item: { ...issue, labels: [{ name: 'ai:Ready' }] } }), /must be an open issue/);
});

test('missing, fractional or nonpositive issue numbers and the trigger branch are rejected', async () => {
  for (const number of ['', '0', '-1', '1.5', 'not-a-number', String(Number.MAX_SAFE_INTEGER + 1)]) {
    await assert.rejects(evaluate({ number }), /Configure AI_LIVE_TEST_ISSUE/);
  }
  await assert.rejects(evaluate({ baseRef: '' }), /Configure AI_LIVE_TEST_ISSUE/);
  await assert.rejects(evaluate({ baseRef: 'ai/live-test' }), /Configure AI_LIVE_TEST_ISSUE/);
});

test('empty and oversized issue descriptions fail before producing a task file', async () => {
  await assert.rejects(evaluate({ item: { ...issue, body: '' } }), /description is empty/);
  await assert.rejects(evaluate({ item: { ...issue, body: 'x'.repeat(20001) } }), /exceeds the test limit/);
});
