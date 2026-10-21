const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const publish = require('../../.github/scripts/publish-review.cjs');
const { decodeEnvelope } = require('../../.github/scripts/review-report.cjs');

test('model JSON flows through validation and publication with trusted provenance and complete usage', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'structured-review-publish-'));
  const previousCwd = process.cwd(), previousDirectory = process.env.REVIEW_DIRECTORY;
  const sha = 'a'.repeat(40), bodies = [];
  const context = { repo: { owner: 'example', repo: 'catalog' }, runId: 100 };
  try {
    process.chdir(directory); process.env.REVIEW_DIRECTORY = directory;
    fs.writeFileSync('context.txt', 'FILE: app.java\n@@ -1 +1 @@\n-old\n+new');
    fs.writeFileSync('metadata.json', JSON.stringify({ number: 3, sha, files: [{ path: 'app.java', lines: [1] }] }));
    const { runReview } = await import('../run-review.mjs');
    const review = { summary: 'Um defeito demonstrado.', findings: [
      { priority: 'P2', title: 'Preço incorreto', body: 'O novo valor quebra o contrato.', path: 'app.java', line: 1 },
    ] };
    await runReview({ env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: directory },
      run: async () => ({ status: 0, stdout: JSON.stringify({ type: 'text', part: { text: JSON.stringify(review) } }) }) });
    fs.writeFileSync('artifacts/ai-usage.json', JSON.stringify({ usage: { complete: true, estimatedCostUsd: 0.2 }, policy: { decision: 'allow' } }));
    const github = { rest: {
      pulls: { get: async () => ({ data: { state: 'open', head: { sha } } }) },
      issues: { listComments() {}, createComment: async ({ body }) => { bodies.push(body); } },
    }, paginate: async () => [] };
    await publish({ github, context, core: { notice() {} } });
    const structured = decodeEnvelope(bodies[0]);
    assert.equal(structured.sha, sha); assert.equal(structured.pr, 3); assert.equal(structured.runId, 100);
    assert.equal(structured.estimatedCostUsd, 0.2); assert.deepEqual(structured.review, review);
    assert.match(bodies[0], /aprovação e o merge cabem a uma pessoa/);
    fs.writeFileSync('artifacts/ai-usage.json', JSON.stringify({ usage: { complete: false, estimatedCostUsd: null }, policy: { decision: 'block' } }));
    await assert.rejects(publish({ github, context, core: { notice() {} } }), /provenance or usage/);
    assert.equal(bodies.length, 1);
  } finally {
    process.chdir(previousCwd);
    if (previousDirectory === undefined) delete process.env.REVIEW_DIRECTORY; else process.env.REVIEW_DIRECTORY = previousDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
