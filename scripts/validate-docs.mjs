import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './repository-config.mjs';

export function withoutFences(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map(line => {
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

export function markdownAnchors(markdown) {
  const anchors = new Set(), seen = new Map();
  const text = withoutFences(markdown);
  for (const line of text.split('\n')) {
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const slug = heading[1].replace(/<[^>]*>/g, '').replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/&amp;/g, '&').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
    const count = seen.get(slug) || 0;
    seen.set(slug, count + 1); anchors.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of text.matchAll(/<(?:a|span)\s+(?:[^>]*?\s)?(?:id|name)=["']([^"']+)["']/gi)) anchors.add(match[1]);
  return anchors;
}

export function validateDocs({ root = ROOT, files } = {}) {
  root = realpathSync(root);
  files ||= execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const selected = [...new Set(files)].filter(f => !f.startsWith('skills/upstream/'));
  const errors = [], cache = new Map(); let links = 0;
  const read = file => { if (!cache.has(file)) cache.set(file, readFileSync(file, 'utf8')); return cache.get(file); };
  for (const file of selected) {
    const source = resolve(root, file), rel = relative(root, source);
    if (rel.startsWith('..') || isAbsolute(rel) || realpathSync(source) !== source) { errors.push({ file, line: 1, reason: 'Unsupported source path.' }); continue; }
    const text = withoutFences(read(source));
    for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)) {
      const raw = match[1] || match[2];
      if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
      links++;
      const line = text.slice(0, match.index).split('\n').length;
      const fail = reason => errors.push({ file, line, reason });
      let target, fragment;
      try { const hash = raw.indexOf('#'); target = decodeURIComponent(hash < 0 ? raw : raw.slice(0, hash)); fragment = hash < 0 ? '' : decodeURIComponent(raw.slice(hash + 1)); }
      catch { fail('Invalid local URL encoding.'); continue; }
      const absolute = target ? resolve(dirname(source), target) : source;
      const destination = relative(root, absolute);
      if (destination.startsWith('..') || isAbsolute(destination)) { fail('Local link escapes the repository.'); continue; }
      if (!existsSync(absolute) || realpathSync(absolute) !== absolute) { fail('Local target does not exist or is a symlink.'); continue; }
      if (fragment && statSync(absolute).isFile() && extname(absolute).toLowerCase() === '.md' && !markdownAnchors(read(absolute)).has(fragment)) fail('Markdown anchor does not exist.');
    }
  }
  return { files: selected.length, links, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = validateDocs();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
