import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateUsage, loadPolicy } from './ai-policy.mjs';
import { implementationInstructions, runOpenCodeImplementation } from './run-live-test.mjs';
import { implementationPrompt } from './implementation-profiles.mjs';

const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = value => nonnegative(value) && Number.isSafeInteger(value);

export function parseClaudeResult(result, secrets = []) {
  let data;
  try { data = JSON.parse(String(result.stdout || '').trim()); } catch { data = null; }
  const raw = data?.usage;
  const valid = count(data?.num_turns) && data.num_turns > 0 && nonnegative(data?.total_cost_usd) &&
    count(raw?.input_tokens) && count(raw?.output_tokens) &&
    (raw?.cache_read_input_tokens === undefined || count(raw.cache_read_input_tokens)) &&
    (raw?.cache_creation_input_tokens === undefined || count(raw.cache_creation_input_tokens));
  const tokens = valid ? { input: raw.input_tokens, output: raw.output_tokens,
    reasoning: null, cacheRead: raw.cache_read_input_tokens ?? 0, cacheWrite: raw.cache_creation_input_tokens ?? 0 } : null;
  const usage = {
    source: 'claude-code-result', complete: Boolean(valid),
    steps: valid ? data.num_turns : 0, startedSteps: valid ? data.num_turns : 0,
    invalidUsageEvents: data && !valid ? 1 : 0,
    tokens, reportedTotalTokens: null,
    policyTokenUnits: tokens ? tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite : null,
    estimatedCostUsd: valid ? data.total_cost_usd : null,
    costBasis: valid ? 'claude-code-client-estimate' : 'unavailable', providerBilledCostUsd: null,
  };
  let failure = null;
  if (result.error?.code === 'ETIMEDOUT') failure = 'TIMEOUT';
  else if (result.error?.code === 'OUTPUT_LIMIT') failure = 'OUTPUT_LIMIT';
  else if (result.error || result.status !== 0) failure = 'PROCESS_FAILED';
  else if (!data || data.type !== 'result') failure = 'INVALID_RESULT';
  else if (data.is_error || data.subtype !== 'success') failure = 'AGENT_FAILED';
  else if (typeof data.result !== 'string' || !data.result.trim()) failure = 'NO_SUMMARY';
  let summary = failure ? '' : data.result.trim();
  for (const secret of secrets.filter(Boolean)) summary = summary.replaceAll(secret, '[REDACTED]');
  return { summary, usage, failure };
}

export function claudeArguments({ taskFile, model, profile, rules, implementationProfileName, taskContent }) {
  if (!model.startsWith('anthropic/')) throw new Error('Claude Code requires an allowed Anthropic model.');
  const controlled=Boolean(implementationProfileName);
  const prompt=controlled?implementationPrompt(implementationProfileName)+'\n<untrusted_task>\n'+taskContent+'\n</untrusted_task>':
    `${implementationInstructions} Read the acceptance criteria from this task file: ${JSON.stringify(taskFile)}.`;
  return [
    '--bare', '-p', prompt,
    '--append-system-prompt', `${rules}\n\nDelivery exception for this invocation: do not commit, push, open, approve, or merge PRs. The workflow publishes only after independent validation.`,
    '--output-format', 'json', '--max-turns', String(profile.maxSteps),
    '--max-budget-usd', String(profile.maxEstimatedCostUsd), '--model', model.slice('anthropic/'.length),
    '--tools', controlled?'Read,Edit,Write,Glob,Grep':'Read,Edit,Write,Glob,Grep,Bash',
    '--allowedTools', controlled?'Read(//workspace/**),Edit(//workspace/**),Glob,Grep':'Read,Edit,Write,Glob,Grep,Bash(./mvnw:*),Bash(git status:*),Bash(git diff:*)',
    ...(controlled?['--setting-sources','', '--settings',JSON.stringify({permissions:{blockReadsOutsideWorkingDirectories:true,
      deny:['Bash','Agent','WebFetch','WebSearch','Read(//proc/**)','Read(//sys/**)','Read(//artifacts/**)','Read(//engine/**)',
        'Edit(//workspace/.git/**)','Edit(//workspace/node_modules/**)','Read(//workspace/**/.env)','Read(//workspace/**/.env.local)']}})]:[]),
    '--permission-prompts', 'none', '--no-session-persistence',
  ];
}

export async function boundedClaudeProcess(args, { profile, env = process.env, command = 'claude' }) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let stdout = '', size = 0, error = null, escalation;
  const stop = code => {
    if (error) return;
    error = { code };
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch { /* Child may already have exited. */ }
    escalation = setTimeout(() => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { /* Child may already have exited. */ }
    }, 1500);
    escalation.unref();
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    size += Buffer.byteLength(chunk);
    if (size > profile.maxOutputBytes) { stop('OUTPUT_LIMIT'); return; }
    if (!error) stdout += chunk;
  });
  child.stderr.on('data', () => { /* Raw provider diagnostics can contain secrets. */ });
  child.on('error', cause => { error = { code: cause.code }; });
  const timer = setTimeout(() => stop('ETIMEDOUT'), profile.timeoutSeconds * 1000);
  const status = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  clearTimeout(escalation);
  return { status, stdout, error };
}

export async function runClaudeImplementation({ env = process.env, command = 'claude',
  usageFile = 'artifacts/ai-usage.json', summaryFile = 'artifacts/implementation-summary.md',
  run = boundedClaudeProcess } = {}) {
  if (!env.MODEL || !env.TASK_FILE || !env.ANTHROPIC_API_KEY) {
    throw new Error('MODEL, TASK_FILE, and ANTHROPIC_API_KEY are required for Claude Code.');
  }
  const profile = loadPolicy('implementation', env.MODEL);
  const rules = readFileSync(env.AI_RULES_FILE||new URL('../AGENTS.md', import.meta.url), 'utf8');
  const args = claudeArguments({ taskFile: env.TASK_FILE, model: env.MODEL, profile, rules,
    implementationProfileName:env.IMPLEMENTATION_PROFILE,taskContent:env.IMPLEMENTATION_PROFILE?readFileSync(env.TASK_FILE,'utf8'):undefined });
  usageFile=env.AI_USAGE_FILE||usageFile;summaryFile=env.AI_SUMMARY_FILE||summaryFile;
  const startedAt = Date.now();
  const result = await run(args, { profile, env, command });
  const parsed = parseClaudeResult(result, [env.ANTHROPIC_API_KEY, env.VLLM_API_KEY]);
  const decision = evaluateUsage(profile, parsed.usage);
  const reasons = [...decision.reasons, ...(parsed.failure ? [parsed.failure] : [])];
  const record = {
    version: 1, agent: 'claude', profile: profile.name, model: env.MODEL,
    runId: env.GITHUB_RUN_ID || 'local', attempt: env.GITHUB_RUN_ATTEMPT || '1',
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    limits: { maxSteps: profile.maxSteps, timeoutSeconds: profile.timeoutSeconds,
      maxEstimatedCostUsd: profile.maxEstimatedCostUsd, maxPolicyTokenUnits: profile.maxPolicyTokenUnits },
    usage: parsed.usage, policy: { decision: reasons.length ? 'block' : 'allow', reasons },
    outcome: parsed.failure ? 'failed' : reasons.length ? 'blocked' : 'completed',
    recordedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(usageFile), { recursive: true });
  writeFileSync(usageFile, JSON.stringify(record, null, 2) + '\n');
  if (reasons.length) throw new Error(`Claude Code execution blocked: ${reasons.join(', ')}.`);
  mkdirSync(dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, parsed.summary + '\n');
  console.log('Claude Code execution completed. Changes require independent validation before publication.');
  return { summary: parsed.summary, usage: record };
}

export async function runImplementation({ env = process.env } = {}) {
  const agent = env.IMPLEMENTATION_AGENT || 'opencode';
  if (agent === 'opencode') return runOpenCodeImplementation({ env });
  if (agent === 'claude') return runClaudeImplementation({ env });
  throw new Error('IMPLEMENTATION_AGENT must be opencode or claude.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await runImplementation();
