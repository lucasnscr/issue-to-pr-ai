const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('../../.github/scripts/review-context.cjs');
const publish = require('../../.github/scripts/publish-review.cjs');

const basePr = { number: 3, state: 'open', draft: false, changed_files: 1,
  head: { sha: 'abc123', repo: { full_name: 'example/catalog' } } };
const file = { filename: 'app.java', status: 'modified', changes: 2, additions: 1, deletions: 1,
  patch: '@@ -1 +1 @@\n-old\n+new' };
const context = { repo: { owner: 'example', repo: 'catalog' }, payload: { pull_request: basePr } };

async function prepareReview(pr = basePr, files = [file]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-ai-review-test-'));
  const previous = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = directory;
  const outputs = {};
  try {
    await prepare({ context, core: { setOutput: (key, value) => { outputs[key] = value; }, notice() {} },
      github: { rest: { pulls: { get: async () => ({ data: pr }), listFiles() {} } }, paginate: async () => files } });
    return outputs;
  } finally {
    if (previous === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('review context requires the current same-repository non-draft SHA', async () => {
  assert.equal((await prepareReview()).ready, 'true');
  assert.equal((await prepareReview({ ...basePr, draft: true })).ready, 'false');
  assert.equal((await prepareReview({ ...basePr, state: 'closed' })).ready, 'false');
  assert.equal((await prepareReview({ ...basePr, head: { ...basePr.head, sha: 'newer' } })).ready, 'false');
  assert.equal((await prepareReview({ ...basePr, head: { ...basePr.head, repo: { full_name: 'fork/catalog' } } })).ready, 'false');
});

test('missing files, truncated patches and oversized diffs fail explicitly', async () => {
  await assert.rejects(prepareReview({ ...basePr, changed_files: 2 }));
  await assert.rejects(prepareReview(basePr, [{ ...file, additions: 2 }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: null }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: null, changes: 0, additions: 0, deletions: 0 }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: '@@ -1 +1 @@\n-old\n+' + 'x'.repeat(33000) }]));
});

test('publisher creates once and updates its own comment for the same SHA', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-ai-idempotency-test-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-ai-publish-workspace-'));
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({ number: 3, sha: basePr.head.sha }));
  fs.mkdirSync(path.join(workspace, 'artifacts'));
  fs.writeFileSync(path.join(workspace, 'artifacts/review.md'), 'Review example.');
  const previous = process.env.REVIEW_DIRECTORY;
  const previousCwd = process.cwd();
  process.env.REVIEW_DIRECTORY = directory;
  const comments = [];
  let created = 0;
  let updated = 0;
  const github = { paginate: async () => comments, rest: {
    pulls: { get: async () => ({ data: basePr }) },
    issues: {
      listComments() {},
      createComment: async ({ body }) => {
        created++;
        comments.push({ id: 7, user: { login: 'github-actions[bot]' }, body });
      },
      updateComment: async ({ comment_id, body }) => {
        updated++;
        assert.equal(comment_id, 7);
        assert(body.includes(basePr.head.sha));
      },
    },
  } };
  try {
    process.chdir(workspace);
    await publish({ context, core: { notice() {} }, github });
    await publish({ context, core: { notice() {} }, github });
    assert.equal(created, 1);
    assert.equal(updated, 1);
  } finally {
    process.chdir(previousCwd);
    if (previous === undefined) delete process.env.REVIEW_DIRECTORY;
    else process.env.REVIEW_DIRECTORY = previous;
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('publisher discards an obsolete SHA before reading or posting a review', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-ai-publish-test-'));
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({ number: 3, sha: 'old' }));
  const previous = process.env.REVIEW_DIRECTORY;
  process.env.REVIEW_DIRECTORY = directory;
  let published = false;
  try {
    await publish({ context, core: { notice() {} }, github: { rest: {
      pulls: { get: async () => ({ data: basePr }) },
      issues: { createComment: async () => { published = true; } },
    } } });
    assert.equal(published, false);
  } finally {
    if (previous === undefined) delete process.env.REVIEW_DIRECTORY;
    else process.env.REVIEW_DIRECTORY = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
