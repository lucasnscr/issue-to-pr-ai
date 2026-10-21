import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createUsageTracker } from './ai-usage.mjs';
import { evaluateUsage, loadPolicy } from './ai-policy.mjs';

// Stop on observed limits, not on a fabricated billing ceiling. A provider may
// already have accepted the next request when a completed step is reported.
export async function runGovernedOpenCode(args, {
  profile: profileName, model, env = process.env, usageFile = 'artifacts/ai-usage.json',
  command = 'opencode', policyFile,
} = {}) {
  const profile = loadPolicy(profileName, model, policyFile);
  const tracker = createUsageTracker();
  const startedAt = Date.now();
  let pending = '', output = '', receivedBytes = 0, stopReason = null, childError = null, providerError = false;
  let escalationTimer;
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  const terminate = reason => {
    if (stopReason) return;
    stopReason = reason;
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch { /* Process may already have exited. */ }
    escalationTimer = setTimeout(() => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { /* Process may already have exited. */ }
    }, 1500);
    escalationTimer.unref();
  };
  const line = value => {
    let event;
    try { event = JSON.parse(value); } catch { return; }
    tracker.observe(event);
    if (event?.type === 'error') providerError = true;
    // The caller needs only summary/error events. Do not retain tool output or
    // reasoning, and do not write raw events to artifacts or the console.
    if (event?.type === 'text' || event?.type === 'error') output += JSON.stringify(event) + '\n';
    const decision = evaluateUsage(profile, tracker.snapshot(), { final: false });
    if (decision.decision === 'block') terminate(decision.reasons.join(', '));
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    receivedBytes += Buffer.byteLength(chunk);
    if (receivedBytes > profile.maxOutputBytes) { terminate('OUTPUT_LIMIT'); return; }
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      line(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
  });
  child.stderr.on('data', () => { /* Drain, never log raw provider/CLI diagnostics. */ });
  child.on('error', error => { childError = { code: error.code }; });
  const timer = setTimeout(() => terminate('TIMEOUT'), profile.timeoutSeconds * 1000);
  const status = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  if (pending && !stopReason) line(pending);
  clearTimeout(escalationTimer);
  const usage = tracker.snapshot();
  const decision = evaluateUsage(profile, usage);
  const failed = Boolean(childError || status !== 0 || providerError);
  // Preserve sanitized provider-error handling in the caller. A failed command
  // is never publishable, even when it failed before producing usage metadata.
  if (!stopReason && !failed && decision.decision === 'block') stopReason = decision.reasons.join(', ');
  const record = {
    version: 1, profile: profile.name, model,
    runId: env.GITHUB_RUN_ID || 'local', attempt: env.GITHUB_RUN_ATTEMPT || '1',
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    limits: { maxSteps: profile.maxSteps, timeoutSeconds: profile.timeoutSeconds,
      maxEstimatedCostUsd: profile.maxEstimatedCostUsd, maxPolicyTokenUnits: profile.maxPolicyTokenUnits },
    usage, policy: { decision: stopReason ? 'block' : decision.decision,
      reasons: stopReason ? stopReason.split(', ') : decision.reasons },
    outcome: stopReason ? 'blocked' : failed ? 'failed' : 'completed',
    recordedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(usageFile), { recursive: true });
  writeFileSync(usageFile, JSON.stringify(record, null, 2) + '\n');
  if (stopReason) {
    const error = new Error(`AI policy blocked execution: ${stopReason}.`);
    error.code = stopReason === 'TIMEOUT' ? 'ETIMEDOUT' : 'AI_POLICY';
    error.usage = record;
    throw error;
  }
  return { status, stdout: output, error: childError, usage: record };
}
