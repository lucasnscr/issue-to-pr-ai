const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = () => import('../run-review.mjs');
const limits = require('../../.github/scripts/review-limits.cjs');

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
    fs.writeFileSync(path.join(directory, 'context.txt'), 'x'.repeat(limits.maxContextBytes + 1));
    await assert.rejects(runReview(options), /limit/);
  });
});
test('prepared frontend-sized context reaches the tool-denied runner without truncation', async () => {
  const { runReview } = await load();
  const prepare = require('../../.github/scripts/review-context.cjs');
  await workspace(async directory => {
    const previous = process.env.RUNNER_TEMP;
    process.env.RUNNER_TEMP = directory;
    try {
      const pr = { number: 24, state: 'open', draft: false, changed_files: 1,
        head: { sha: 'commit', repo: { full_name: 'example/catalog' } } };
      const patch = '@@ -1 +1 @@\n-old\n+' + 'x'.repeat(59000);
      const listFiles = () => {};
      const listComments = () => {};
      const outputs = {};
      await prepare({ context: { repo: { owner: 'example', repo: 'catalog' }, payload: { pull_request: pr } },
        core: { setOutput: (key, value) => { outputs[key] = value; }, notice() {} },
        github: { rest: { pulls: { get: async () => ({ data: pr }), listFiles }, issues: { listComments } },
          paginate: async method => method === listComments ? [] : [{ filename: 'app.js', status: 'modified',
            changes: 2, additions: 1, deletions: 1, patch }] } });
      assert.equal(outputs.ready, 'true');
      const review = await runReview({
        env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: outputs.directory },
        run: async args => {
          assert(args[1].includes(patch));
          assert.equal(args[args.indexOf('--agent') + 1], 'reviewer');
          return { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: 'Contexto completo recebido.' } }) };
        },
      });
      assert.equal(review, 'Contexto completo recebido.');
    } finally {
      if (previous === undefined) delete process.env.RUNNER_TEMP;
      else process.env.RUNNER_TEMP = previous;
    }
  });
});

test('runner accepts its exact shared byte limit and rejects oversized UTF-8 before inference', async () => {
  const { runReview } = await load();
  await workspace(async directory => {
    let calls = 0;
    const options = { env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: directory },
      run: async () => {
        calls++;
        return { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: 'Revisado.' } }) };
      } };
    fs.writeFileSync(path.join(directory, 'context.txt'), 'x'.repeat(limits.maxContextBytes));
    await runReview(options);
    assert.equal(calls, 1);
    fs.writeFileSync(path.join(directory, 'context.txt'), 'é'.repeat(limits.maxContextBytes / 2 + 1));
    await assert.rejects(runReview(options), /limit/);
    assert.equal(calls, 1);
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
