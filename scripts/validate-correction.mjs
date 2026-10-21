import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import loop from '../.github/scripts/engineering-loop.cjs';

export function validateCorrection(directory, expectedSha, { stage = false } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || git('rev-parse', 'HEAD').trim() !== expectedSha) {
    throw new Error('Correction changed HEAD or has an invalid expected SHA.');
  }
  const files = [...new Set([...git('diff', '--name-only', '--no-renames', '-z', 'HEAD').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))];
  if (!files.length || files.length > loop.limits.maxChangedFiles || files.some(file => !loop.allowedPath(file))) {
    throw new Error('Correction is empty or exceeds the allowed source/test/Markdown scope.');
  }
  for (const file of files) {
    if (/\/db\/migration\//.test(file) && git('ls-tree', 'HEAD', '--', file).trim()) {
      throw new Error('Correction must not change an existing migration.');
    }
    try {
      const stat = lstatSync(`${directory}/${file}`);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o111 || readFileSync(`${directory}/${file}`).includes(0)) {
        throw new Error('Correction contains a symlink, executable, or binary file.');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!files.some(file => file.startsWith('apps/catalog-api/src/main/')) ||
      !files.some(file => file.startsWith('apps/catalog-api/src/test/'))) {
    throw new Error('Correction requires a production change and a regression-test change.');
  }
  if (stage) git('add', '--', ...files);
  const patch = git('diff', ...(stage ? ['--cached'] : []), '--binary', 'HEAD');
  if (Buffer.byteLength(patch) > loop.limits.maxCorrectionPatchBytes) throw new Error('Correction patch exceeds the byte limit.');
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = validateCorrection(process.cwd(), process.env.EXPECTED_SHA, { stage: true });
  console.log(`Validated ${files.length} correction paths, including a regression test.`);
}
