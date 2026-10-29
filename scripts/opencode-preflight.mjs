import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGovernedOpenCode } from './run-governed-opencode.mjs';
import { implementationProvider } from './model-provider.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'opencode-fixture-'));
const image = 'issue-to-pr-opencode:1.19.3';
const container = 'opencode-fixture-' + process.pid + '-' + Date.now();
const started = Date.now();
try {
  const build = spawnSync('docker', ['build', '-t', image, new URL('../infra/agents', import.meta.url).pathname],
    { timeout: 300000, encoding: 'utf8', maxBuffer: 10485760 });
  if (build.status !== 0) throw new Error('AGENT_IMAGE_BUILD_FAILED');
  writeFileSync(join(workspace, 'fixture.json'), JSON.stringify({ status: 'degraded', keep: 'unchanged' }) + '\n');
  const provider = implementationProvider({ MODEL: 'ollama/qwen3-coder:30b' });
  const config = { ...JSON.parse(provider.env.OPENCODE_CONFIG_CONTENT), $schema: 'https://opencode.ai/config.json',
    plugin: [], mcp: {}, permission: { '*': 'deny', read: 'allow', edit: 'allow', external_directory: 'deny' },
    agent: { preflight: { mode: 'primary', steps: 5 } } };
  // Docker Desktop's private host bridge reaches the loopback-only native server.
  // Remote automation uses the separately authenticated gateway, never this bridge.
  config.provider.ollama.options.baseURL = 'http://host.docker.internal:11434/v1';
  const args = ['run', '--rm', '--name', container, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user', `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,
    '--pids-limit=128', '--memory=2g', '--cpus=2', '--tmpfs', '/tmp:rw,exec,size=1g,mode=1777',
    '-v', `${workspace}:/workspace:rw`, '-e', `OPENCODE_CONFIG_CONTENT=${JSON.stringify(config)}`,
    image, 'run', '--agent', 'preflight', '--model', 'ollama/qwen3-coder:30b', '--format', 'json',
    'Read fixture.json using the read tool. Edit its status from degraded to healthy, preserving keep unchanged. Change no other file. Do not run commands. Finish with a concise summary.'];
  const result = await runGovernedOpenCode(args, { command: 'docker', profile: 'implementation',
    model: 'ollama/qwen3-coder:30b', usageFile: 'artifacts/opencode-governed-usage.json' });
  const events = (result.stdout || '').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const usage = result.usage.usage;
  const fixture = JSON.parse(readFileSync(join(workspace, 'fixture.json'), 'utf8'));
  if (result.status !== 0 || events.some(event => event.type === 'error') || !usage.complete ||
      fixture.status !== 'healthy' || fixture.keep !== 'unchanged' || Object.keys(fixture).length !== 2) {
    // Report aggregate event shapes only, never raw tool/model output.
    console.error(JSON.stringify({ status: result.status, error: result.error?.code,
      events: events.map(event => ({ type: event.type, tool: event.part?.tool, status: event.part?.state?.status,
        error: event.error?.name })), usage }));
    throw new Error('OPENCODE_FIXTURE_FAILED');
  }
  const report = { version: 1, result: 'passed', scope: 'opencode-isolated-fixture', model: 'ollama/qwen3-coder:30b',
    opencodeVersion: '1.19.3', durationMs: Date.now() - started, usage, policy: result.usage.policy,
    isolation: 'Nonprivileged disposable container; only synthetic workspace mounted; no host home or Docker socket.',
    limitations: ['Not an application implementation or ephemeral GitHub runner test.'], recordedAt: new Date().toISOString() };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/opencode-preflight.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore', timeout: 10000 });
  rmSync(workspace, { recursive: true, force: true });
}
