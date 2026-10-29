import { createHash } from 'node:crypto';
export const targets = { 'lucasnscr/issue-to-pr-ai': 'catalog-java' };
export function issueSnapshot(issue) {
  if (issue.state !== 'OPEN' || issue.pull_request || !issue.labels?.some(label => label.name === 'ai:ready') ||
      typeof issue.body !== 'string' || !issue.body.trim() || issue.body.length > 20000) throw new Error('An open authorized issue with bounded acceptance criteria is required.');
  return createHash('sha256').update(JSON.stringify([issue.number, issue.title, issue.body])).digest('hex');
}
export function targetProfile(repo) {
  if (!Object.hasOwn(targets, repo)) throw new Error('Repository is outside the trusted local target list.');
  return targets[repo];
}
export function verifyVm(vm, name) {
  if (!/^sentinela-ai-[a-z0-9-]+$/.test(name) || vm.name !== name || vm.status !== 'Running' ||
      vm.config?.mounts?.length || vm.config?.ssh?.forwardAgent) throw new Error('A dedicated running Lima VM without shared mounts or SSH agent is required.');
}
