import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function repositoryName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) throw new Error('Use an explicit OWNER/REPOSITORY.');
  return value;
}

export function loadRepositoryConfig(root = ROOT) {
  const config = JSON.parse(readFileSync(resolve(root, 'config/repository.json'), 'utf8'));
  const safePath = value => typeof value === 'string' && !value.includes('\\') &&
    !value.startsWith('/') && value.split('/').every(p => p && p !== '.' && p !== '..');
  const requiredPaths = ['application', 'documentation', 'quickstart', 'contributing', 'security', 'decisions'];
  if (config.version !== 1 || !config.method?.name || !/^\d+\.\d+\.\d+$/.test(config.method.version) ||
      !config.paths || requiredPaths.some(key => !safePath(config.paths[key])) || Object.values(config.paths).some(p => !safePath(p)) ||
      typeof config.github?.template !== 'boolean' || !/^[A-Za-z0-9._/-]+$/.test(config.github.defaultBranch || '') ||
      typeof config.github.description !== 'string' || config.github.description.length > 350 ||
      !Array.isArray(config.github.topics) || config.github.topics.length > 20 || config.github.topics.some(t => !/^[a-z0-9-]{1,50}$/.test(t)) ||
      !Array.isArray(config.github.labels) || !config.github.labels.length || config.github.labels.length > 30) throw new Error('Invalid repository reference configuration.');
  const names = new Set();
  for (const label of config.github.labels) {
    if (!/^[a-z][a-z0-9:-]{1,49}$/.test(label.name || '') || names.has(label.name) || !/^[a-f0-9]{6}$/.test(label.color || '') ||
        typeof label.description !== 'string' || label.description.length > 100) throw new Error('Invalid or duplicate repository label.');
    names.add(label.name);
  }
  if (!['ai:ready', 'ai:autofix'].every(name => names.has(name))) throw new Error('Authorization labels must remain in the reference catalog.');
  return config;
}
