import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const timeoutMs = 10 * 60 * 1000;

export function interpretLiveResult(result, apiKey, timeout = timeoutMs) {
  const redact = value => apiKey ? String(value).replaceAll(apiKey, '[REDACTED]') : String(value);
  const events = String(result.stdout || '').split('\n').flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`OpenCode timed out after ${timeout / 1000} seconds.`);
  }
  const failure = events.find(event => event?.type === 'error');
  if (failure) {
    const data = failure.error?.data;
    const status = Number.isInteger(data?.statusCode) ? ` (HTTP ${data.statusCode})` : '';
    const message = redact(data?.message || failure.error?.name || 'provider error')
      .replaceAll(/[\r\n]+/g, ' ').slice(0, 1200);
    throw new Error(`OpenCode reported an error${status}: ${message}`);
  }
  if (result.error) throw new Error('OpenCode could not complete the process.');
  if (result.status !== 0) throw new Error(`OpenCode failed (exit ${result.status ?? 'unavailable'}).`);
  const summary = events.filter(event => event?.type === 'text')
    .map(event => typeof event.part?.text === 'string' ? event.part.text : '').join('\n').trim();
  if (!summary) throw new Error('The agent returned no summary.');
  return redact(summary);
}

function main() {
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
  ], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 12 * 1024 * 1024 });
  const summary = interpretLiveResult(result, process.env.ANTHROPIC_API_KEY);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/implementation-summary.md', summary + '\n');
  console.log('Real model execution completed. Changes will be validated before publication.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
