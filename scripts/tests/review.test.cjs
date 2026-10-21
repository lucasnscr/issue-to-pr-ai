const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('../../.github/scripts/review-context.cjs');
const publish = require('../../.github/scripts/publish-review.cjs');
const { encodeEnvelope } = require('../../.github/scripts/review-report.cjs');

const basePr = { number: 3, state: 'open', draft: false, changed_files: 1,
  head: { sha: 'abc123', repo: { full_name: 'example/catalog' } } };
const file = { filename: 'app.java', status: 'modified', changes: 2, additions: 1, deletions: 1,
  patch: '@@ -1 +1 @@\n-old\n+new' };
const context = { repo: { owner: 'example', repo: 'catalog' }, payload: { pull_request: basePr } };

async function prepareReview(pr = basePr, files = [file], comments = [], triggeredPr = basePr) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-ai-review-test-'));
  const previous = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = directory;
  const outputs = {};
  const listComments = () => {};
  try {
    await prepare({ context: { ...context, payload: { pull_request: triggeredPr } },
      core: { setOutput: (key, value) => { outputs[key] = value; }, notice() {} },
      github: { rest: { pulls: { get: async () => ({ data: pr }), listFiles() {} }, issues: { listComments } },
        paginate: async method => method === listComments ? comments : files } });
    if (outputs.ready === 'true') outputs.contextText = fs.readFileSync(path.join(outputs.directory, 'context.txt'), 'utf8');
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

test('a completed bot review suppresses another paid request for the same SHA', async () => {
  const comment = { user: { login: 'github-actions[bot]' }, body: `<!-- continuous-ai-review:${basePr.head.sha} -->\nReviewed.` };
  assert.equal((await prepareReview(basePr, [file], [comment])).ready, 'false');
  assert.equal((await prepareReview(basePr, [file], [{ ...comment, user: { login: 'someone-else' } }])).ready, 'true');
  assert.equal((await prepareReview(basePr, [file], [{ ...comment, body: '<!-- continuous-ai-review:obsolete -->' }])).ready, 'true');
});

test('an existing structured review exposes its source run for opt-in without another inference', async () => {
  const sha = 'a'.repeat(40);
  const pr = { ...basePr, head: { ...basePr.head, sha } };
  const body = `<!-- continuous-ai-review:${sha} -->\n` + encodeEnvelope({
    version: 1, repository: 'example/catalog', pr: 3, sha, runId: 100, runAttempt: 1,
    estimatedCostUsd: 0.1, usageComplete: true, policyDecision: 'allow', review: { summary: 'Achado.', findings: [] },
  });
  const result = await prepareReview(pr, [file], [{ user: { login: 'github-actions[bot]' }, body }], pr);
  assert.equal(result.ready, 'false'); assert.equal(result.existing_review_run_id, '100');
});

test('missing files, truncated patches and oversized diffs fail explicitly', async () => {
  await assert.rejects(prepareReview({ ...basePr, changed_files: 2 }));
  await assert.rejects(prepareReview(basePr, [{ ...file, additions: 2 }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: null }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: null, changes: 0, additions: 0, deletions: 0 }]));
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: '@@ -1 +1 @@\n-old\n+' + 'x'.repeat(96000) }]));
});

test('frontend-sized patches are retained completely with bounded trusted base context', async () => {
  const patch = '@@ -1 +1 @@\n-old\n+' + 'x'.repeat(59000);
  const result = await prepareReview(basePr, [{ ...file, patch,
    filename: 'apps/catalog-api/src/test/java/dev/continuousai/catalog/product/ProductApiIT.java' }]);
  assert.equal(result.ready, 'true');
  assert(result.contextText.includes('TRUSTED BASE EXCERPT:'));
  assert(result.contextText.endsWith(patch));
  assert(Buffer.byteLength(result.contextText) <= 112000);
});

test('patch byte boundary accepts the complete limit and rejects the next byte', async () => {
  const prefix = '@@ -1 +1 @@\n-old\n+';
  const envelope = `FILE: ${file.filename} (${file.status})\n`;
  const exact = { ...file, patch: prefix + 'x'.repeat(96000 - Buffer.byteLength(envelope + prefix)) };
  assert.equal((await prepareReview(basePr, [exact])).ready, 'true');
  await assert.rejects(prepareReview(basePr, [{ ...exact, patch: exact.patch + 'x' }]), /review limit/);
});

test('patch limits count UTF-8 bytes rather than characters', async () => {
  const prefix = '@@ -1 +1 @@\n-old\n+';
  assert.equal((await prepareReview(basePr, [{ ...file, patch: prefix + 'x'.repeat(48000) }])).ready, 'true');
  await assert.rejects(prepareReview(basePr, [{ ...file, patch: prefix + 'é'.repeat(48000) }]), /review limit/);
});

test('explicit trusted dispatch permits draft review while forks remain blocked', async () => {
  const previous = process.env.ALLOW_DRAFT_REVIEW;
  process.env.ALLOW_DRAFT_REVIEW = 'true';
  try {
    assert.equal((await prepareReview({ ...basePr, draft: true })).ready, 'true');
    assert.equal((await prepareReview({ ...basePr, draft: true,
      head: { ...basePr.head, repo: { full_name: 'fork/catalog' } } })).ready, 'false');
  } finally {
    if (previous === undefined) delete process.env.ALLOW_DRAFT_REVIEW;
    else process.env.ALLOW_DRAFT_REVIEW = previous;
  }
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
