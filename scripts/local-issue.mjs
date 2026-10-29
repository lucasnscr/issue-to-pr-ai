import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { targetProfile, issueSnapshot, verifyVm } from './local-issue-policy.mjs';
import { validateChanges } from './validate-agent-changes.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = arg.match(/^--(repo|issue|vm|acceptance|seed-pr)=(.+)$/);
  if (!match) throw new Error('Use --repo=OWNER/REPO --issue=N [--vm=sentinela-ai-pilot].');
  return [match[1], match[2]];
}));
const repo = options.repo, issueNumber = Number(options.issue), vm = options.vm || 'sentinela-ai-pilot';
const profile = targetProfile(repo);
if (options.acceptance && options.acceptance !== 'catalog-categories-no-store') throw new Error('Unknown independent acceptance profile.');
if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('Invalid issue number.');
const runId = randomUUID(), remote = '/tmp/sentinela-job-' + runId;
const temporary = mkdtempSync(join(tmpdir(), 'sentinela-publisher-'));
const root = new URL('../', import.meta.url).pathname;
const execute = (command, args, cwd, timeout = 120000) => execFileSync(command, args,
  { cwd, encoding: 'utf8', timeout, maxBuffer: 10485760, stdio: ['ignore', 'pipe', 'pipe'] });
const gh = (...args) => execute('gh', args);
const api = path => JSON.parse(gh('api', path));
const guest = (...args) => execute('limactl', ['shell', vm, '--', ...args], undefined, 1200000);
const copy = (from, to) => execute('limactl', ['copy', from, to]);
const issue = () => JSON.parse(gh('issue', 'view', String(issueNumber), '--repo', repo, '--json', 'number,title,body,state,labels'));
let container, locked = false, stage = 'authorization';
try {
  verifyVm(JSON.parse(execute('limactl', ['list', vm, '--json'])), vm);
  if (execute('git', ['status', '--porcelain', '--', 'scripts', 'config', 'infra/agents', 'opencode.json'], root).trim()) {
    throw new Error('Commit the trusted executor before running an issue.');
  }
  const engineSha = execute('git', ['rev-parse', 'HEAD'], root).trim();
  guest('mkdir', '/tmp/sentinela-ai-executor-lock');
  locked = true;
  const actor = api('user').login;
  if (!['admin', 'maintain', 'write'].includes(api(`repos/${repo}/collaborators/${actor}/permission`).permission)) throw new Error('Write access required.');
  const initial = issue(), snapshot = issueSnapshot(initial);
  const branch = api('repos/' + repo).default_branch;
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error('Invalid default branch.');
  const base = api(`repos/${repo}/commits/${encodeURIComponent(branch)}`).sha;
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid base SHA.');
  const task = join(temporary, 'task.md');
  let seed = null;
  if (options['seed-pr']) {
    const seedNumber = Number(options['seed-pr']);
    if (!Number.isSafeInteger(seedNumber) || seedNumber < 1) throw new Error('Invalid reviewed seed PR.');
    seed = JSON.parse(gh('pr', 'view', String(seedNumber), '--repo', repo, '--json', 'number,state,baseRefOid,isCrossRepository,body'));
    if (seed.state !== 'CLOSED' || seed.isCrossRepository || seed.baseRefOid !== base ||
        !seed.body.includes('Closes #' + issueNumber + '\n')) throw new Error('Seed must be a closed same-repository PR for this issue and base.');
    writeFileSync(join(temporary, 'seed.patch'), gh('pr', 'diff', String(seedNumber), '--repo', repo));
  }
  writeFileSync(task, `Repository: ${repo}\nIssue: #${issueNumber}\n` +
    (seed ? `A reviewed implementation from PR #${seed.number} is already applied. Preserve its runtime logic and tests. Complete missing API/README documentation; avoid unrelated changes.\n` : '') +
    `<untrusted_issue>\n${initial.title}\n${initial.body}\n</untrusted_issue>\n`);
  execute('git', ['archive', '--format=tar.gz', '--output=' + join(temporary, 'engine.tgz'), engineSha,
    'scripts', 'config', 'infra/agents', 'opencode.json', 'AGENTS.md'], root);
  guest('mkdir', '-p', remote + '/engine');
  copy(join(temporary, 'engine.tgz'), vm + ':' + remote + '/engine.tgz');
  copy(task, vm + ':' + remote + '/task.md');
  guest('tar', '-xzf', remote + '/engine.tgz', '-C', remote + '/engine');
  guest('git', 'clone', '--quiet', '--branch', branch, 'https://github.com/' + repo + '.git', remote + '/workspace');
  if (guest('git', '-C', remote + '/workspace', 'rev-parse', 'HEAD').trim() !== base) throw new Error('Base moved while cloning.');
  if (seed) {
    copy(join(temporary, 'seed.patch'), vm + ':' + remote + '/seed.patch');
    guest('git', '-C', remote + '/workspace', 'apply', '--check', remote + '/seed.patch');
    guest('git', '-C', remote + '/workspace', 'apply', remote + '/seed.patch');
    guest('sh', '-c', 'cd "$1" && EXPECTED_SHA="$2" node "$3/scripts/validate-agent-changes.mjs"',
      'sh', remote + '/workspace', base, remote + '/engine');
  }
  // Read-only control files come from the trusted engine, not from the issue.
  const overlay = { $schema: 'https://opencode.ai/config.json', share: 'disabled', autoupdate: false, plugin: [], mcp: {},
    permission: { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', edit: 'allow', external_directory: 'deny', bash: 'deny' },
    instructions: ['/workspace/AGENTS.md'], agent: { 'live-implementer': { mode: 'primary', steps: 35, temperature: 0, permission: { bash: 'deny' } } } };
  writeFileSync(join(temporary, 'opencode.json'), JSON.stringify(overlay));
  copy(join(temporary, 'opencode.json'), vm + ':' + remote + '/opencode.json');
  // One local job per dedicated VM. Listener ownership is checked by the proxy
  // command: an occupied port fails before any model execution.
  guest('sh', '-c', 'nohup node "$1/scripts/ollama-loopback-proxy.mjs" > "$2/proxy.log" 2>&1 & echo $! > "$2/proxy.pid"', 'sh', remote + '/engine', remote);
  const proxyPid = guest('cat', remote + '/proxy.pid').trim();
  if (!/^[1-9]\d*$/.test(proxyPid)) throw new Error('Proxy did not start.');
  guest('kill', '-0', proxyPid);
  guest('node', '-e', 'fetch("http://127.0.0.1:11434/api/version").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))');
  guest('env', 'OLLAMA_BASE_URL=http://127.0.0.1:11434', 'OLLAMA_REPORT=' + remote + '/preflight.json',
    'node', remote + '/engine/scripts/ollama-preflight.mjs');
  container = 'sentinela-agent-' + runId;
  const uid = guest('id', '-u').trim(), gid = guest('id', '-g').trim();
  console.log('Authorized ' + repo + '#' + issueNumber + '; running isolated Qwen with profile ' + profile + '.');
  stage = 'model';
  guest('docker', 'run', '--rm', '--name', container, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user', uid + ':' + gid, '--pids-limit=128', '--memory=2g', '--cpus=2', '--network=host',
    '--tmpfs', '/tmp:rw,exec,size=1g,mode=1777', '-v', remote + '/workspace:/workspace:rw',
    '-v', remote + '/engine:/engine:ro', '-v', remote + '/task.md:/task.md:ro',
    '-v', remote + '/opencode.json:/control/opencode.json:ro', '-e', 'OPENCODE_CONFIG=/control/opencode.json',
    '-e', 'MODEL=ollama/qwen3-coder:30b', '-e', 'IMPLEMENTATION_PROFILE=' + profile,
    '-e', 'TASK_FILE=/task.md', '--entrypoint', 'node', 'issue-to-pr-opencode:1.19.3', '/engine/scripts/run-implementation.mjs');
  stage = 'scope';
  guest('sh', '-c', 'cd "$1" && EXPECTED_SHA="$2" IMPLEMENTATION_PROFILE="$3" node "$4/scripts/validate-agent-changes.mjs"',
    'sh', remote + '/workspace', base, profile, remote + '/engine');
  console.log('Patch scope passed; running independent application regression in the dedicated VM.');
  stage = 'regression';
  guest('sh', '-c', 'cd "$1" && ./mvnw -B -ntp verify > "$2/validation.log" 2>&1', 'sh', remote + '/workspace', remote);
  stage = 'http-acceptance';
  guest('sh', '-c', 'cd "$1" && docker compose -p "$3" up --build --wait > "$2/http.log" 2>&1 && node "$4/scripts/smoke.mjs" && node "$4/scripts/category-acceptance.mjs" && node "$4/scripts/price-acceptance.mjs" && node "$4/scripts/ordering-acceptance.mjs"',
    'sh', remote + '/workspace', remote, 'ai-' + runId, remote + '/engine');
  if (options.acceptance) guest('node', '-e', 'fetch("http://127.0.0.1:8080/api/products/categories").then(r=>{if(!r.ok||!r.headers.get("cache-control")?.includes("no-store"))throw Error("Independent no-store acceptance failed");return r.json()}).then(x=>{if(!Array.isArray(x))throw Error("Categories contract changed")})');
  guest('sh', '-c', 'cd "$1" && git diff --cached --binary > "$2/implementation.patch"', 'sh', remote + '/workspace', remote);
  copy(vm + ':' + remote + '/implementation.patch', join(temporary, 'implementation.patch'));
  copy(vm + ':' + remote + '/workspace/artifacts/ai-usage.json', join(temporary, 'ai-usage.json'));
  const usage = JSON.parse(readFileSync(join(temporary, 'ai-usage.json'), 'utf8'));
  if (usage.outcome !== 'completed' || usage.policy?.decision !== 'allow' || !usage.usage?.complete) throw new Error('Usage does not authorize publication.');
  if (issueSnapshot(issue()) !== snapshot || api(`repos/${repo}/commits/${encodeURIComponent(branch)}`).sha !== base) throw new Error('Issue or base changed; do not publish.');
  if (!['admin', 'maintain', 'write'].includes(api(`repos/${repo}/collaborators/${actor}/permission`).permission)) throw new Error('Write access revoked.');
  stage = 'publication';
  const publisher = join(temporary, 'publisher');
  execute('git', ['clone', '--quiet', '--branch', branch, 'https://github.com/' + repo + '.git', publisher]);
  if (execute('git', ['rev-parse', 'HEAD'], publisher).trim() !== base) throw new Error('Publisher base moved.');
  execute('git', ['apply', '--check', join(temporary, 'implementation.patch')], publisher);
  execute('git', ['apply', '--index', join(temporary, 'implementation.patch')], publisher);
  validateChanges(publisher, base, profile);
  // Trusted size hook reads staged blobs, without executing candidate code.
  execute(process.execPath, [join(root, 'scripts/check-staged-file-size.mjs')], publisher);
  const deliveryBranch = 'ai/issue-' + issueNumber + '-' + runId.slice(0, 8);
  execute('git', ['switch', '-c', deliveryBranch], publisher);
  execute('git', ['-c', 'user.name=local-ai-delivery', '-c', 'user.email=local-ai-delivery@users.noreply.github.com',
    'commit', '-m', 'Implement issue #' + issueNumber + ' with Qwen and independent validation'], publisher);
  // Check authorization immediately before the only credential-bearing step.
  if (issueSnapshot(issue()) !== snapshot || api(`repos/${repo}/commits/${encodeURIComponent(branch)}`).sha !== base) throw new Error('Authorization changed before push.');
  execute('git', ['push', 'origin', deliveryBranch], publisher);
  const body = join(temporary, 'pr.md');
  writeFileSync(body, `Closes #${issueNumber}\n\nImplementado por Qwen local com OpenCode 1.19.3. Perfil: ${profile}. Base: ${base}.\n\nValidação independente em VM sem home compartilhado: escopo, regressão da aplicação e uso completo. ${usage.usage.steps} etapas; ${usage.usage.policyTokenUnits} unidades de tokens.\n\nPublicação fora do processo do modelo. PR draft; revisão e merge permanecem separados. Execução local: ${runId}.\n`);
  const pr = gh('pr', 'create', '--repo', repo, '--draft', '--base', branch, '--head', deliveryBranch,
    '--title', 'Implementa issue #' + issueNumber + ' com Qwen local', '--body-file', body).trim();
  const report = { version: 1, result: 'passed', repo, issue: issueNumber, profile, base, engineSha, actor, runId, pr, seedPr: seed?.number,
    model: usage.model, usage: usage.usage, validation: 'Independent application regression in dedicated Lima VM',
    recordedAt: new Date().toISOString() };
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  writeFileSync(join(root, 'artifacts/local-issue-' + issueNumber + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) {
  let reason;
  if (stage === 'scope') {
    const diagnostic = String(error.stderr || '');
    reason = ['outside the task scope', 'Symlink changes', 'changed HEAD', 'requires application changes', '25-file', 'Unknown trusted'].find(value => diagnostic.includes(value)) || 'scope-validator-process';
    try {
      mkdirSync(join(root, 'artifacts'), { recursive: true });
      const candidate = guest('git', '-C', remote + '/workspace', 'diff', 'HEAD', '--binary');
      writeFileSync(join(root, 'artifacts/local-issue-' + issueNumber + '-failed.patch'), candidate);
      const status = guest('git', '-C', remote + '/workspace', 'status', '--short');
      writeFileSync(join(root, 'artifacts/local-issue-' + issueNumber + '-scope.txt'), diagnostic.slice(0, 4000) + '\n' + status);
    } catch {}
  }
  try {
    mkdirSync(join(root, 'artifacts'), { recursive: true });
    copy(vm + ':' + remote + '/validation.log', join(root, 'artifacts/local-issue-' + issueNumber + '-validation.log'));
  } catch {}
  for (const [from, name] of [['workspace/artifacts/ai-usage.json', 'failed-usage.json'], ['http.log', 'http.log']]) {
    try { copy(vm + ':' + remote + '/' + from, join(root, 'artifacts/local-issue-' + issueNumber + '-' + name)); } catch {}
  }
  console.error('Local delivery failed at ' + stage + ': ' + (reason || (error.status ? 'bounded subprocess exited ' + error.status : error.message)));
  // Keep sanitized diagnostics only. The workspace is always removed; reruns
  // start from a fresh base rather than executing unreviewed leftovers.
  process.exitCode = 1;
} finally {
  if (container) { try { guest('docker', 'rm', '-f', container); } catch {} }
  try { guest('sh', '-c', 'if [ -f "$1/compose.yml" ] || [ -f "$1/compose.yaml" ]; then cd "$1" && docker compose -p "$2" down -v; fi', 'sh', remote + '/workspace', 'ai-' + runId); } catch {}
  try { guest('sh', '-c', 'if [ -f "$1/proxy.pid" ]; then kill "$(cat "$1/proxy.pid")" 2>/dev/null || true; fi; rm -rf -- "$1"', 'sh', remote); } catch {}
  if (locked) { try { guest('rmdir', '/tmp/sentinela-ai-executor-lock'); } catch {} }
  rmSync(temporary, { recursive: true, force: true });
}
