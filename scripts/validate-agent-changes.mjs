import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { implementationProfile } from './implementation-profiles.mjs';

export function validateChanges(directory, expectedSha, profileName = 'catalog-java') {
  const profile = implementationProfile(profileName);
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (!/^[0-9a-f]{40}$/.test(expectedSha || '') || git('rev-parse', 'HEAD').trim() !== expectedSha) {
    throw new Error('The agent changed HEAD or the expected base SHA is invalid.');
  }
  const files = [...new Set([
    ...git('diff', '--name-only', '-z', 'HEAD').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
  ].filter(Boolean))];
  // artifacts/ contains workflow output, and must never enter the implementation patch.
  for (const file of files) {
    if (!profile.allowed(file) || file.split('/').some(part => part === '..' || part === '.git')) {
      throw new Error(`Agent changed a path outside the task scope: ${file}`);
    }
    try {
      if (lstatSync(`${directory}/${file}`).isSymbolicLink()) throw new Error(`Symlink changes are not allowed: ${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!files.some(profile.application) || !files.some(profile.regression)) {
    throw new Error('The real feature test requires application changes and integration-test changes.');
  }
  if (files.length > 25) throw new Error('The implementation exceeds the 25-file task limit.');
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = validateChanges(process.cwd(), process.env.EXPECTED_SHA, process.env.IMPLEMENTATION_PROFILE);
  execFileSync('git', ['add', '--', ...files], { stdio: 'inherit' });
  console.log(`Validated ${files.length} application/test/documentation paths.`);
}
