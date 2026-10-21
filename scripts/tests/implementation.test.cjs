const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = overrides => ({ type: 'result', subtype: 'success', is_error: false,
  result: 'Implemented and tested.', total_cost_usd: 0.42, num_turns: 6,
  usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 300 }, ...overrides });
const processResult = data => ({ status: 0, stdout: JSON.stringify(data) });
const load = () => import('../run-implementation.mjs');

test('Claude JSON usage keeps estimates separate from invoiced cost and redacts summaries', async () => {
  const { parseClaudeResult } = await load();
  const result = parseClaudeResult(processResult(fixture({ result: 'Done FAKE_TEST_KEY' })), ['FAKE_TEST_KEY']);
  assert.equal(result.summary, 'Done [REDACTED]');
  assert.equal(result.failure, null);
  assert.equal(result.usage.estimatedCostUsd, 0.42);
  assert.equal(result.usage.providerBilledCostUsd, null);
  assert.equal(result.usage.policyTokenUnits, 3800);
  assert.equal(result.usage.steps, 6);
  assert.equal(result.usage.costBasis, 'claude-code-client-estimate');
});

test('Claude provider/process failures never become successful summaries', async () => {
  const { parseClaudeResult } = await load();
  const cases = [
    { input: { status: 1, stdout: 'SECRET_RAW_FAILURE' }, expected: 'PROCESS_FAILED' },
    { input: processResult(fixture({ is_error: true, result: 'SECRET_RAW_FAILURE' })), expected: 'AGENT_FAILED' },
    { input: processResult(fixture({ subtype: 'error_max_budget_usd' })), expected: 'AGENT_FAILED' },
    { input: { status: 0, stdout: 'SECRET_INVALID_JSON' }, expected: 'INVALID_RESULT' },
    { input: processResult(fixture({ result: '' })), expected: 'NO_SUMMARY' },
    { input: processResult(fixture({ result: null })), expected: 'NO_SUMMARY' },
    { input: { status: null, stdout: '', error: { code: 'ETIMEDOUT' } }, expected: 'TIMEOUT' },
  ];
  for (const { input, expected } of cases) {
    const parsed = parseClaudeResult(input);
    assert.equal(parsed.failure, expected);
    assert.equal(parsed.summary, '');
    assert(!JSON.stringify(parsed).includes('SECRET_'));
  }
});

test('Claude missing and malformed usage remains unavailable instead of zero', async () => {
  const { parseClaudeResult } = await load();
  for (const overrides of [{ usage: null }, { total_cost_usd: -1 }, { total_cost_usd: null },
    { num_turns: 0 }, { usage: { input_tokens: -1, output_tokens: 3 } }]) {
    const { usage } = parseClaudeResult(processResult(fixture(overrides)));
    assert.equal(usage.complete, false);
    assert.equal(usage.estimatedCostUsd, null);
    assert.equal(usage.policyTokenUnits, null);
  }
});

test('Claude arguments explicitly load trusted rules and restrict tools without bypass permissions', async () => {
  const { claudeArguments } = await load();
  const args = claudeArguments({ taskFile: '/tmp/task.md', model: 'anthropic/claude-sonnet-4-6',
    profile: { maxSteps: 35, maxEstimatedCostUsd: 5 }, rules: 'TRUSTED_AGENTS_RULES' });
  const value = flag => args[args.indexOf(flag) + 1];
  assert(args.includes('--bare'));
  assert(args.includes('--no-session-persistence'));
  assert.equal(value('--max-turns'), '35');
  assert.equal(value('--max-budget-usd'), '5');
  assert.equal(value('--model'), 'claude-sonnet-4-6');
  assert.equal(value('--permission-prompts'), 'none');
  assert.equal(value('--tools'), 'Read,Edit,Write,Glob,Grep,Bash');
  assert.match(value('--allowedTools'), /Bash\(\.\/mvnw:\*\)/);
  assert.match(value('--append-system-prompt'), /TRUSTED_AGENTS_RULES/);
  assert.match(value('-p'), /\/tmp\/task.md/);
  assert(!args.includes('--dangerously-skip-permissions'));
  assert.throws(() => claudeArguments({ taskFile: '/tmp/task.md', model: 'vllm/qwen-coder', profile: {} }), /Anthropic/);
});

async function withClaude(data, callback) {
  const { runClaudeImplementation } = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-wrapper-test-'));
  const usageFile = path.join(directory, 'usage.json');
  const summaryFile = path.join(directory, 'summary.md');
  const invoke = () => runClaudeImplementation({
    env: { MODEL: 'anthropic/claude-sonnet-4-6', TASK_FILE: '/tmp/test-issue.md', ANTHROPIC_API_KEY: 'FAKE_LOCAL_KEY' },
    usageFile, summaryFile, run: async () => processResult(data),
  });
  try { await callback({ invoke, usageFile, summaryFile }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('Claude wrapper publishes only a sanitized summary with complete allowed telemetry', async () => {
  await withClaude(fixture({ result: 'Done FAKE_LOCAL_KEY' }), async ({ invoke, usageFile, summaryFile }) => {
    await invoke();
    assert.equal(fs.readFileSync(summaryFile, 'utf8'), 'Done [REDACTED]\n');
    const record = JSON.parse(fs.readFileSync(usageFile));
    assert.equal(record.policy.decision, 'allow');
    assert.equal(record.outcome, 'completed');
    assert(!JSON.stringify(record).includes('FAKE_LOCAL_KEY'));
  });
});

test('Claude wrapper blocks a budget overrun and never writes an implementation summary', async () => {
  await withClaude(fixture({ total_cost_usd: 8 }), async ({ invoke, usageFile, summaryFile }) => {
    await assert.rejects(invoke(), /COST_LIMIT/);
    assert.equal(fs.existsSync(summaryFile), false);
    const record = JSON.parse(fs.readFileSync(usageFile));
    assert.equal(record.policy.decision, 'block');
    assert.equal(record.usage.estimatedCostUsd, 8);
  });
});

test('Claude wrapper fails closed for missing telemetry and missing result text', async () => {
  for (const overrides of [{ usage: null }, { result: '' }]) {
    await withClaude(fixture(overrides), async ({ invoke, summaryFile }) => {
      await assert.rejects(invoke(), /USAGE_UNAVAILABLE|NO_SUMMARY/);
      assert.equal(fs.existsSync(summaryFile), false);
    });
  }
});

test('unknown implementation agents are rejected before invoking a CLI', async () => {
  const { runImplementation } = await load();
  await assert.rejects(runImplementation({ env: { IMPLEMENTATION_AGENT: 'untrusted-agent' } }), /opencode or claude/);
});
