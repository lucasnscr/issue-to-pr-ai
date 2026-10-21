import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

if (!process.env.MODEL || !process.env.TASK_FILE || !process.env.ANTHROPIC_API_KEY) {
  throw new Error('MODEL, TASK_FILE, and ANTHROPIC_API_KEY are required for the real test.');
}
const result = spawnSync('opencode', [
  'run',
  'Implement the attached issue in this working tree. Follow AGENTS.md except delivery: this diagnostic workflow handles Git/PR publication. ' +
  'Do not run any git mutation, publish, or merge. Add real integration tests and update OpenAPI/README. ' +
  'Change only apps/catalog-api/src and Markdown documentation. Finish with a concise summary in Portuguese.',
  '--model', process.env.MODEL, '--agent', 'live-implementer', '--format', 'json',
  '--file', process.env.TASK_FILE,
], { encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 12 * 1024 * 1024 });
if (result.error || result.status !== 0) throw new Error(`OpenCode failed (${result.status}): ${result.error?.message || 'nonzero exit'}`);
const events = result.stdout.split('\n').flatMap(line => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const failure = events.find(event => event.type === 'error');
if (failure) {
  const message = String(failure.error?.data?.message || failure.error?.name || 'provider error')
    .replaceAll(process.env.ANTHROPIC_API_KEY, '[REDACTED]');
  throw new Error(`OpenCode reported an error: ${message.slice(0, 1200)}`);
}
const summary = events.filter(event => event.type === 'text').map(event => event.part?.text || '').join('\n').trim();
if (!summary) throw new Error('The agent returned no summary.');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/implementation-summary.md', summary.replaceAll(process.env.ANTHROPIC_API_KEY, '[REDACTED]') + '\n');
console.log('Real model execution completed. Changes will be validated before publication.');
