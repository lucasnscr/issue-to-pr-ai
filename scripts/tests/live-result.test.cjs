const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const key = 'FAKE_LOCAL_KEY';
const parseResult = () => import('../run-live-test.mjs');
const json = event => JSON.stringify(event) + '\n';

test('provider errors retain HTTP diagnostics when OpenCode exits nonzero', async () => {
  const { interpretLiveResult } = await parseResult();
  for (const statusCode of [400, 401]) {
    const result = { status: 1, stdout: json({ type: 'error', error: { name: 'APIError', data: {
      statusCode, message: `LOCAL_SIMULATED_HTTP_${statusCode}: ${key}`,
      responseBody: 'RAW_RESPONSE_MUST_NOT_BE_PRINTED',
    } } }), stderr: 'RAW_STDERR_MUST_NOT_BE_PRINTED' };
    assert.throws(() => interpretLiveResult(result, key), error => {
      assert.match(error.message, new RegExp(`HTTP ${statusCode}`));
      assert.match(error.message, new RegExp(`LOCAL_SIMULATED_HTTP_${statusCode}`));
      assert.match(error.message, /\[REDACTED\]/);
      assert(!error.message.includes(key));
      assert(!error.message.includes('RAW_'));
      return true;
    });
  }
});

test('provider error events fail even when the CLI exit status is zero', async () => {
  const { interpretLiveResult } = await parseResult();
  assert.throws(() => interpretLiveResult({ status: 0,
    stdout: json({ type: 'error', error: { name: 'ProviderError' } }) }, key), /ProviderError/);
});

test('timeouts are explicit and process failures never expose raw output', async () => {
  const { interpretLiveResult } = await parseResult();
  assert.throws(() => interpretLiveResult({ status: null, stdout: '',
    error: { code: 'ETIMEDOUT', message: key }, stderr: key }, key),
  /^Error: OpenCode timed out after 600 seconds\.$/);
  assert.throws(() => interpretLiveResult({ status: 2, stdout: key, stderr: key }, key),
    /^Error: OpenCode failed \(exit 2\)\.$/);
  assert.throws(() => interpretLiveResult({ status: null, stdout: '',
    error: { code: 'ENOENT', message: key } }, key), /^Error: OpenCode could not complete the process\.$/);
});

test('successful summaries redact the key and tolerate unrelated output', async () => {
  const { interpretLiveResult } = await parseResult();
  const stdout = 'ordinary log\nnull\n' + json({ type: 'text', part: { text: `Done ${key}` } }) +
    json({ type: 'text', part: { text: 'Tests passed.' } });
  assert.equal(interpretLiveResult({ status: 0, stdout }, key), 'Done [REDACTED]\nTests passed.');
  assert.throws(() => interpretLiveResult({ status: 0, stdout: 'ordinary log\n' }, key), /no summary/);
});

test('the CLI entrypoint runs through a symlink and checks required configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'live-result-entrypoint-'));
  try {
    const script = path.join(directory, 'run-live-test.mjs');
    fs.symlinkSync(path.resolve(__dirname, '../run-live-test.mjs'), script);
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {} });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MODEL, TASK_FILE, and ANTHROPIC_API_KEY are required/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
