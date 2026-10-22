import { execFileSync } from 'node:child_process';
import { repositoryName } from './repository-config.mjs';

// Only fixed GitHub routes and structured JSON; never a shell or credential value.
export function githubApi(endpoint, { method = 'GET', data } = {}) {
  try {
    const args = ['api', endpoint, '--method', method];
    if (data !== undefined) args.push('--input', '-');
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', input: data === undefined ? undefined : JSON.stringify(data),
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 2 * 1024 * 1024 }));
  } catch { throw new Error('GitHub metadata request failed; verify repository access with gh auth status.'); }
}

export function collectGithubMetadata(repository, api = githubApi) {
  const repo = repositoryName(repository), prefix = `repos/${repo}`;
  const metadata = { repository: repo, unavailable: [] };
  const get = (name, route) => {
    try { metadata[name] = api(route); }
    catch { metadata.unavailable.push(name); }
  };
  get('repo', prefix);
  if (!metadata.repo) return metadata;
  get('protection', `${prefix}/branches/${encodeURIComponent(metadata.repo.default_branch)}/protection`);
  get('variables', `${prefix}/actions/variables?per_page=100`);
  // The secrets endpoint returns names/metadata, never their values.
  get('secrets', `${prefix}/actions/secrets?per_page=100`);
  get('labels', `${prefix}/labels?per_page=100`);
  get('workflowPermissions', `${prefix}/actions/permissions/workflow`);
  return metadata;
}
