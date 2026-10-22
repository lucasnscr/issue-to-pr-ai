import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectGithubMetadata } from './github-metadata.mjs';
import { loadRepositoryConfig, ROOT } from './repository-config.mjs';
import skills from './skills.cjs';

const profiles = {
  specification: { flags: ['AI_ENABLED', 'AI_SPEC_ENABLED'], model: 'SPEC_MODEL', policy: 'specification' },
  implementation: { flags: ['AI_ENABLED'], model: 'OPENCODE_MODEL', policy: 'implementation' },
  claude: { flags: ['AI_ENABLED', 'CLAUDE_ENABLED'], model: 'CLAUDE_MODEL', policy: 'implementation' },
  review: { flags: ['AI_ENABLED', 'AI_REVIEW_ENABLED'], model: 'REVIEW_MODEL', policy: 'review' },
  loop: { flags: ['AI_ENABLED', 'AI_REVIEW_ENABLED', 'AI_LOOP_ENABLED'], model: 'CORRECTION_MODEL', policy: 'correction' },
};
export const PROFILES = ['base', ...Object.keys(profiles), 'all'];

export function checkGithub(metadata, { config, protection, policy, profile }) {
  const checks = [];
  const add = (id, status, message) => checks.push({ id, status, message });
  const repo = metadata.repo;
  if (!repo) { add('github-access', 'fail', 'Repository metadata unavailable; verify repository and current access.'); return checks; }
  add('github-access', 'pass', 'Repository metadata was readable.');
  add('default-branch', repo.default_branch === config.github.defaultBranch ? 'pass' : 'fail', 'Default branch must match the versioned reference configuration.');
  add('repository-template', repo.is_template === config.github.template ? 'pass' : 'warn', 'Template setting compared with the reference; bootstrap can apply it.');
  add('repository-description', Boolean(repo.description) ? 'pass' : 'warn', 'A repository description helps identify the method.');
  if (metadata.protection) {
    const actual = metadata.protection;
    const contexts = new Set([...(actual.required_status_checks?.contexts || []), ...(actual.required_status_checks?.checks || []).map(c => c.context)]);
    const required = protection.required_status_checks.contexts;
    const ready = required.every(name => contexts.has(name)) && actual.required_status_checks?.strict === true &&
      actual.enforce_admins?.enabled === true && actual.allow_force_pushes?.enabled === false && actual.allow_deletions?.enabled === false;
    add('branch-protection', ready ? 'pass' : 'fail', 'Required checks, updated branch and administrator enforcement must remain active, without force push or deletion.');
  } else add('branch-protection', 'fail', 'Branch protection could not be verified; unavailable is not equivalent to protected.');
  if (Array.isArray(metadata.labels) && metadata.labels.length < 100) {
    const names = new Set(metadata.labels.map(l => l.name));
    const missing = config.github.labels.filter(l => !names.has(l.name));
    add('repository-labels', missing.length ? 'warn' : 'pass', missing.length ? 'Some reference labels are missing; inspect the bootstrap preview.' : 'All reference labels exist.');
  } else add('repository-labels', 'warn', 'Label metadata is unavailable or incomplete.');
  const workflowPermissions = metadata.workflowPermissions;
  add('workflow-publication', workflowPermissions?.can_approve_pull_request_reviews === true ? 'pass' : 'warn',
    'GitHub Actions must be allowed to create PRs; this setting does not authorize the model to approve or merge.');
  const chosen = profile === 'all' ? ['specification', 'implementation', 'review', 'loop'] : profile === 'base' ? [] : [profile];
  if (!chosen.length) return checks;
  if (!metadata.variables || metadata.variables.total_count > 100 || !metadata.secrets || metadata.secrets.total_count > 100) {
    add('ai-metadata', 'fail', 'Complete variable and secret-name metadata is required to assess an AI profile.'); return checks;
  }
  const variables = Object.fromEntries(metadata.variables.variables.map(v => [v.name, v.value]));
  const secrets = new Set(metadata.secrets.secrets.map(s => s.name));
  for (const name of chosen) {
    const settings = profiles[name];
    const enabled = settings.flags.every(flag => variables[flag] === 'true');
    add(`${name}-enabled`, enabled ? 'pass' : 'fail', `Required activation flags for ${name} must explicitly be true.`);
    const model = variables[settings.model] || 'anthropic/claude-sonnet-4-6';
    const allowed = policy.profiles[settings.policy].allowedModels.includes(model) && (name !== 'claude' || model.startsWith('anthropic/'));
    add(`${name}-model`, allowed ? 'pass' : 'fail', 'Configured model must belong to the versioned profile allowlist.');
    const credential = model.startsWith('vllm/') ? secrets.has('VLLM_API_KEY') && Boolean(variables.VLLM_BASE_URL) : model.startsWith('anthropic/') && secrets.has('ANTHROPIC_API_KEY');
    add(`${name}-credential-name`, credential ? 'pass' : 'fail', 'Provider credential name and any required endpoint must exist; values and provider connectivity are not inspected.');
  }
  return checks;
}

export function checkTools(run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 })) {
  const probes = [
    ['node', 'node', ['--version'], output => Number(output.match(/^v(\d+)/)?.[1]) >= 22, 'Node.js 22 or newer'],
    ['java', 'java', ['--version'], output => Number(output.match(/(?:openjdk|java)\s+(\d+)/)?.[1]) === 21, 'Java 21'],
    ['python', 'python3', ['--version'], output => { const match = output.match(/Python (\d+)\.(\d+)/); return match && (Number(match[1]) > 3 || Number(match[1]) === 3 && Number(match[2]) >= 10); }, 'Python 3.10 or newer'],
    ['docker', 'docker', ['version', '--format', '{{.Server.Version}}'], output => /^\d+\./.test(output.trim()), 'Docker CLI and daemon'],
  ];
  return probes.map(([id, command, args, valid, message]) => {
    try { return { id: `tool-${id}`, status: valid(run(command, args)) ? 'pass' : 'fail', message }; }
    catch { return { id: `tool-${id}`, status: 'fail', message: `${message} unavailable; no test execution was inferred.` }; }
  });
}

export function repositoryDoctor({ root = ROOT, profile = 'base', github, tools = false, runTool } = {}) {
  if (!PROFILES.includes(profile)) throw new Error('Unknown doctor profile.');
  const config = loadRepositoryConfig(root);
  const checks = [];
  for (const [name, relative] of Object.entries(config.paths)) checks.push({ id: `path-${name}`, status: existsSync(resolve(root, relative)) ? 'pass' : 'fail', message: relative });
  try { skills.loadCatalog(root); checks.push({ id: 'skill-catalog', status: 'pass', message: 'Catalog resources and hashes are valid.' }); }
  catch { checks.push({ id: 'skill-catalog', status: 'fail', message: 'Skill catalog is invalid or changed outside its registered hashes.' }); }
  const protection = JSON.parse(readFileSync(resolve(root, 'config/branch-protection.json'), 'utf8'));
  const policy = JSON.parse(readFileSync(resolve(root, 'config/ai-policy.json'), 'utf8'));
  if (tools) checks.push(...checkTools(runTool));
  if (github) checks.push(...checkGithub(github, { config, protection, policy, profile }));
  else if (profile !== 'base') checks.push({ id: 'github-profile', status: 'warn', message: 'Use --github --repo OWNER/REPOSITORY to inspect activation and credential names for this profile.' });
  const status = checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'warn') ? 'warn' : 'pass';
  return { version: 1, methodVersion: config.method.version, profile, scope: github ? 'source-and-github-configuration' : 'source-configuration',
    status, ready: status === 'pass', executionVerified: false, checks,
    note: 'Readiness diagnostics do not execute the application, model or loop and do not prove test success. Consult CI and validation evidence.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    if (args.some((arg, i) => !['--github', '--repo', '--profile', '--tools', '--offline'].includes(arg) && !['--repo', '--profile'].includes(args[i - 1]))) throw new Error('Unknown doctor argument.');
    if (args.includes('--github') && args.includes('--offline')) throw new Error('Choose offline or GitHub diagnostics.');
    const github = args.includes('--github') ? collectGithubMetadata(value('--repo')) : undefined;
    const result = repositoryDoctor({ profile: value('--profile') || 'base', tools: args.includes('--tools'), github });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'fail' ? 1 : result.status === 'warn' ? 2 : 0;
  } catch { console.error('Repository doctor failed; verify arguments, local configuration and GitHub access.'); process.exitCode = 1; }
}
