const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = () => import('../run-review.mjs');

async function workspace(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-free-review-'));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    await callback(directory);
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('tool-denied reviewer receives the complete patch as data without an implicit Read attachment', async () => {
  const { runReview } = await load();
  await workspace(async directory => {
    const patch = 'FILE: app.java\n@@ -1 +1 @@\n-old\n+new';
    fs.writeFileSync(path.join(directory, 'context.txt'), patch);
    const review = await runReview({ env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: directory },
      run: async (args, options) => {
        assert(!args.includes('--file'));
        assert(args[1].includes(patch));
        assert(args[1].includes('<untrusted_patch>'));
        assert.equal(args[args.indexOf('--agent') + 1], 'reviewer');
        assert.equal(options.profile, 'review');
        return { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: 'Nenhum defeito encontrado.' } }) };
      } });
    assert.equal(review, 'Nenhum defeito encontrado.');
  });
});
test('missing or oversized context fails before any inference', async () => {
  const { runReview } = await load();
  await workspace(async directory => {
    const options = { env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: directory },
      run: async () => { assert.fail('Inference must not start.'); } };
    await assert.rejects(runReview(options), /ENOENT/);
    fs.writeFileSync(path.join(directory, 'context.txt'), '');
    await assert.rejects(runReview(options), /empty/);
    fs.writeFileSync(path.join(directory, 'context.txt'), 'x'.repeat(40001));
    await assert.rejects(runReview(options), /limit/);
  });
});
test('review failures retain sanitized provider diagnostics instead of only an exit code', async () => {
  const { runReview } = await load();
  await workspace(async directory => {
    fs.writeFileSync(path.join(directory, 'context.txt'), 'A bounded patch.');
    await assert.rejects(runReview({ env: { MODEL: 'anthropic/claude-sonnet-4-6',
      REVIEW_DIRECTORY: directory, ANTHROPIC_API_KEY: 'FAKE_SECRET' },
      run: async () => ({ status: 1, stdout: JSON.stringify({ type: 'error',
        error: { data: { statusCode: 400, message: 'Invalid request FAKE_SECRET' } } }) }),
    }), error => error.message.includes('HTTP 400') && error.message.includes('[REDACTED]') && !error.message.includes('FAKE_SECRET'));
    assert(!fs.existsSync('artifacts/review.md'));
  });
});
