import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const started = Number(process.env.STARTED_AT || Math.floor(Date.now() / 1000));
const record = {
  runId: process.env.GITHUB_RUN_ID || 'local',
  attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  job: process.env.GITHUB_JOB || 'local',
  agent: process.env.AGENT || 'none',
  model: process.env.MODEL || 'none',
  durationSeconds: Math.max(0, Math.floor(Date.now() / 1000) - started),
  agentOutcome: process.env.AGENT_OUTCOME || 'skipped',
  testsOutcome: process.env.TEST_OUTCOME || 'not-run',
  recordedAt: new Date().toISOString(),
};
if (existsSync('artifacts/ai-usage.json')) {
  const telemetry = JSON.parse(readFileSync('artifacts/ai-usage.json', 'utf8'));
  // Only trusted aggregate fields; avoid copying arbitrary CLI output.
  record.usageSource = telemetry.usage?.source || 'unavailable';
  record.estimatedCostUsd = telemetry.usage?.estimatedCostUsd ?? 'unavailable';
  record.costBasis = telemetry.usage?.costBasis || 'unavailable';
  record.providerBilledCostUsd = 'unavailable';
  record.policyTokenUnits = telemetry.usage?.policyTokenUnits ?? 'unavailable';
  record.policyDecision = telemetry.policy?.decision || 'unavailable';
}
mkdirSync('artifacts', { recursive: true });
writeFileSync(`artifacts/run-${record.job}.json`, JSON.stringify(record, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Execução de IA\n\n| Campo | Valor |\n|---|---|\n` +
    Object.entries(record).map(([key, value]) => `| ${key} | ${String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n') + '\n');
}
