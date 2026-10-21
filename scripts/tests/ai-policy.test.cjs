const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const model = 'anthropic/claude-sonnet-4-6';
const imports = () => Promise.all([
  import('../ai-policy.mjs'), import('../ai-usage.mjs'), import('../run-governed-opencode.mjs'),
]);
const finish = (id = 'prt_1', overrides = {}) => ({ type: 'step_finish', part: {
  id, sessionID: 'ses_1', cost: 0.02,
  tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 10 }, total: 160 },
  ...overrides,
} });

test('allowlist rejects an unconfigured provider/model and malformed policy', async () => {
  const [{ loadPolicy, validatePolicy }] = await imports();
  assert.equal(loadPolicy('implementation', model).maxSteps, 35);
  assert.throws(() => loadPolicy('implementation', 'unknown/secret-model'), /not allowed/);
  assert.throws(() => loadPolicy('toString', model), /Unknown/);
  assert.throws(() => validatePolicy({ version: 2, profiles: {} }), /Invalid/);
  const valid = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/ai-policy.json')));
  for (const key of ['maxSteps', 'timeoutSeconds', 'maxPolicyTokenUnits', 'maxOutputBytes']) {
    const modified = structuredClone(valid);
    modified.profiles.implementation[key] = -1;
    assert.throws(() => validatePolicy(modified), /Invalid/);
  }
});

test('usage preserves token dimensions, estimates cost and deduplicates repeated step events', async () => {
  const [, { parseOpenCodeUsage }] = await imports();
  const event = finish();
  const usage = parseOpenCodeUsage(['banner', 'null', JSON.stringify(event), JSON.stringify(event),
    JSON.stringify(finish('prt_2', { cost: 0.03 }))].join('\n'));
  assert.equal(usage.steps, 2);
  assert.equal(usage.estimatedCostUsd, 0.05);
  assert.equal(usage.providerBilledCostUsd, null);
  assert.equal(usage.costBasis, 'opencode-model-pricing-estimate');
  assert.equal(usage.reportedTotalTokens, 320);
  assert.equal(usage.policyTokenUnits, 330);
  assert.deepEqual(usage.tokens, { input: 200, output: 40, reasoning: 10, cacheRead: 60, cacheWrite: 20 });
  assert(usage.complete);
});

test('missing usage remains unavailable and fails closed only on completion', async () => {
  const [{ loadPolicy, evaluateUsage }, { parseOpenCodeUsage }] = await imports();
  const usage = parseOpenCodeUsage(JSON.stringify({ type: 'text', part: { text: 'Done' } }));
  assert.equal(usage.estimatedCostUsd, null);
  assert.equal(usage.policyTokenUnits, null);
  assert.equal(evaluateUsage(loadPolicy('review', model), usage, { final: false }).decision, 'allow');
  assert.deepEqual(evaluateUsage(loadPolicy('review', model), usage).reasons, ['USAGE_UNAVAILABLE']);
});

test('unknown provider total is not fabricated from overlapping dimensions', async () => {
  const [, { parseOpenCodeUsage }] = await imports();
  const event = finish();
  delete event.part.tokens.total;
  assert.equal(parseOpenCodeUsage(JSON.stringify(event)).reportedTotalTokens, null);
});

test('malformed, negative and incomplete usage blocks publication', async () => {
  const [{ loadPolicy, evaluateUsage }, { parseOpenCodeUsage }] = await imports();
  for (const overrides of [{ cost: -1 }, { cost: null }, { tokens: { input: 1 } }, { id: '' }, { tokens: {} }]) {
    const usage = parseOpenCodeUsage(JSON.stringify(finish('prt_1', overrides)));
    assert(evaluateUsage(loadPolicy('review', model), usage).reasons.includes('INVALID_USAGE'));
  }
  const usage = parseOpenCodeUsage([
    { type: 'step_start', part: { id: 'start1', sessionID: 'ses_1' } },
    finish(), { type: 'step_start', part: { id: 'start2', sessionID: 'ses_1' } },
  ].map(JSON.stringify).join('\n'));
  assert.equal(usage.complete, false);
});

test('cost, conservative token units and step thresholds block exceeded limits', async () => {
  const [{ loadPolicy, evaluateUsage }, { parseOpenCodeUsage }] = await imports();
  const usage = parseOpenCodeUsage([finish(), finish('prt_2')].map(JSON.stringify).join('\n'));
  const profile = { ...loadPolicy('implementation', model), maxEstimatedCostUsd: 0.03,
    maxPolicyTokenUnits: 300, maxSteps: 1 };
  assert.deepEqual(evaluateUsage(profile, usage).reasons, ['STEP_LIMIT', 'COST_LIMIT', 'TOKEN_LIMIT']);
  assert.equal(evaluateUsage({ ...profile, maxEstimatedCostUsd: 0.04,
    maxPolicyTokenUnits: 330, maxSteps: 2 }, usage).decision, 'allow');
});

async function runFake(source, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-governance-'));
  const script = path.join(directory, 'fake.cjs');
  const usageFile = path.join(directory, 'usage.json');
  fs.writeFileSync(script, source);
  const policy = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/ai-policy.json')));
  Object.assign(policy.profiles.implementation, overrides);
  const policyFile = path.join(directory, 'policy.json');
  fs.writeFileSync(policyFile, JSON.stringify(policy));
  const [, , { runGovernedOpenCode }] = await imports();
  try {
    let result, error;
    try {
      result = await runGovernedOpenCode([script], { profile: 'implementation', model,
        command: process.execPath, usageFile, policyFile });
    } catch (caught) { error = caught; }
    return { result, error, record: JSON.parse(fs.readFileSync(usageFile, 'utf8')) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('governed runner streams usage and retains no prompts, tool payloads or raw stderr', async () => {
  const secret = 'LOCAL_SECRET_MUST_NOT_BE_RECORDED';
  const { result, error, record } = await runFake([
    `console.error(${JSON.stringify(secret)});`,
    `console.log(JSON.stringify({ type: 'tool_use', part: { text: ${JSON.stringify(secret)} } }));`,
    `console.log(${JSON.stringify(JSON.stringify(finish()))});`,
    `console.log(JSON.stringify({ type: 'text', part: { text: 'Done' } }));`,
  ].join('\n'));
  assert.equal(error, undefined);
  assert.equal(result.status, 0);
  assert(!result.stdout.includes(secret));
  assert(!JSON.stringify(record).includes(secret));
  assert.equal(record.outcome, 'completed');
});

test('governed runner blocks successful output with no usage', async () => {
  const { error, record } = await runFake('console.log(JSON.stringify({type:"text",part:{text:"Done"}}));');
  assert.match(error.message, /USAGE_UNAVAILABLE/);
  assert.equal(record.outcome, 'blocked');
});

test('governed runner stops on a streamed cost limit before normal process completion', async () => {
  const { error, record } = await runFake(`console.log(${JSON.stringify(JSON.stringify(finish('prt_1', { cost: 8 })))});
    setInterval(() => {}, 1000);`);
  assert.match(error.message, /COST_LIMIT/);
  assert.equal(record.usage.estimatedCostUsd, 8);
  assert.equal(record.outcome, 'blocked');
});

test('governed runner preserves provider errors without inventing zero cost', async () => {
  const { result, error, record } = await runFake('console.log(JSON.stringify({type:"error",error:{name:"APIError"}})); process.exitCode = 1;');
  assert.equal(error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /APIError/);
  assert.equal(record.usage.estimatedCostUsd, null);
  assert.equal(record.outcome, 'failed');
});

test('governed runner bounds output and elapsed execution', async () => {
  const output = await runFake('console.log("x".repeat(1000));', { maxOutputBytes: 100 });
  assert.match(output.error.message, /OUTPUT_LIMIT/);
  const timeout = await runFake('setInterval(() => {}, 1000);', { timeoutSeconds: 1 });
  assert.equal(timeout.error.code, 'ETIMEDOUT');
  assert.deepEqual(timeout.record.policy.reasons, ['TIMEOUT']);
});
