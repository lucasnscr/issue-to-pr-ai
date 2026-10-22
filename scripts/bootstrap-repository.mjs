import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubApi } from './github-metadata.mjs';
import { loadRepositoryConfig, repositoryName } from './repository-config.mjs';

export function bootstrapPlan(repository, config = loadRepositoryConfig()) {
  const repo = repositoryName(repository);
  return { version: 1, mode: 'preview', repository: repo,
    settings: { description: config.github.description, homepage: `https://github.com/${repo}/blob/${config.github.defaultBranch}/${config.paths.documentation}`,
      is_template: config.github.template }, topics: config.github.topics, labels: config.github.labels,
    unchanged: ['secrets', 'AI variables', 'branch protection', 'visibility', 'existing unrelated labels and topics', 'CODEOWNERS'] };
}

export function bootstrap({ repository, apply = false, config = loadRepositoryConfig(), api = githubApi } = {}) {
  const plan = bootstrapPlan(repository, config);
  if (apply !== true) return plan;
  const prefix = `repos/${plan.repository}`;
  // Read existing state before the first mutation; failures cannot produce a
  // partial "success". Operations are idempotent; a failed apply can be retried.
  const current = api(prefix);
  const labels = api(`${prefix}/labels?per_page=100`);
  if (!Array.isArray(labels) || labels.length >= 100 || !Array.isArray(current.topics)) throw new Error('Repository metadata is incomplete; no changes applied.');
  const topics = [...new Set([...current.topics, ...plan.topics])].sort();
  if (topics.length > 20) throw new Error('Topic union exceeds GitHub limits; no changes applied.');
  api(prefix, { method: 'PATCH', data: plan.settings });
  api(`${prefix}/topics`, { method: 'PUT', data: { names: topics } });
  for (const label of plan.labels) {
    const existing = labels.find(item => item.name === label.name);
    if (existing && existing.color.toLowerCase() === label.color && existing.description === label.description) continue;
    api(existing ? `${prefix}/labels/${encodeURIComponent(label.name)}` : `${prefix}/labels`,
      { method: existing ? 'PATCH' : 'POST', data: existing ? { color: label.color, description: label.description } : label });
  }
  return { ...plan, mode: 'applied', note: 'No AI activation or branch-protection change was performed. Run the read-only doctor next.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg, i) => !['--repo', '--apply'].includes(arg) && args[i - 1] !== '--repo')) throw new Error('Use --repo OWNER/REPOSITORY and optional --apply.');
    const repository = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : undefined;
    console.log(JSON.stringify(bootstrap({ repository, apply: args.includes('--apply') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
