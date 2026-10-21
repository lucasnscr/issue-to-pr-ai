const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PHASES = ['specification', 'implementation', 'testing', 'review', 'correction'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hash = value => createHash('sha256').update(value).digest('hex');

function readApproved(root, relative) {
  root = fs.realpathSync(root);
  if (typeof relative !== 'string' || !relative.startsWith('skills/') || relative.includes('\\') ||
      relative.split('/').some(p => !p || p === '.' || p === '..') || !relative.endsWith('.md')) throw new Error('Invalid catalog resource.');
  const absolute = path.resolve(root, relative);
  if (fs.realpathSync(absolute) !== absolute || !fs.statSync(absolute).isFile()) throw new Error('Skill resources must be regular files without symlinks.');
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.trim() || Buffer.byteLength(content) > 20000) throw new Error('Skill resource is empty or oversized.');
  return content;
}

function loadCatalog(root = ROOT) {
  const text = fs.readFileSync(path.join(root, 'config/skills-catalog.json'), 'utf8');
  const catalog = JSON.parse(text);
  if (catalog.version !== 1 || !Array.isArray(catalog.skills) || !catalog.skills.length || catalog.skills.length > 30 ||
      catalog.maxSelection !== 8 || catalog.maxContextBytes !== 16000) throw new Error('Invalid skills catalog limits.');
  const ids = new Set();
  for (const skill of catalog.skills) {
    if (!ID.test(skill.id || '') || ids.has(skill.id) || typeof skill.version !== 'string' ||
        !Array.isArray(skill.phases) || !skill.phases.length || skill.phases.some(p => !PHASES.includes(p)) ||
        !Array.isArray(skill.resources) || !skill.resources.length) throw new Error('Invalid or duplicate skill.');
    ids.add(skill.id);
    for (const resource of skill.resources) {
      if (!Array.isArray(resource.phases) || resource.phases.some(p => !skill.phases.includes(p)) ||
          !/^[a-f0-9]{64}$/.test(resource.sha256 || '') || hash(readApproved(root, resource.path)) !== resource.sha256) throw new Error(`Skill integrity failed: ${skill.id}.`);
    }
  }
  for (const [phase, defaults] of Object.entries(catalog.defaults)) {
    if (!PHASES.includes(phase) || !Array.isArray(defaults) || defaults.some(id => !catalog.skills.find(s => s.id === id && s.phases.includes(phase)))) throw new Error('Invalid default skills.');
  }
  return { ...catalog, hash: hash(text) };
}

function normalizeSelection(selection, catalog) {
  if (!Array.isArray(selection) || selection.length > catalog.maxSelection || selection.some(id => typeof id !== 'string' || !ID.test(id))) throw new Error('Select at most eight catalog skill IDs.');
  const normalized = [...new Set(selection.map(id => catalog.aliases?.[id] || id))].sort();
  for (const id of normalized) if (!catalog.skills.some(s => s.id === id)) throw new Error('Unknown skill ID. Select IDs from the approved catalog.');
  return normalized;
}

function selectionFromIssue(body = '', catalog = loadCatalog()) {
  if (typeof body !== 'string' || body.length > 20000) throw new Error('Issue is oversized.');
  let fenced = false, section = false, count = 0;
  const values = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^#{1,6} /.test(line)) {
      section = /^### Skills\s*$/.test(line);
      if (section && ++count > 1) throw new Error('Duplicate Skills sections.');
      continue;
    }
    if (section && line.trim() && line.trim() !== '_No response_') {
      values.push(...line.replace(/^\s*[-*]\s+/, '').split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  return normalizeSelection(values, catalog);
}

function bundle({ selection = [], phases, commit = null, root = ROOT } = {}) {
  const catalog = loadCatalog(root);
  const selected = normalizeSelection(selection, catalog);
  if (!Array.isArray(phases) || !phases.length || phases.some(p => !PHASES.includes(p))) throw new Error('Valid skill phases required.');
  if (commit !== null && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full trusted catalog commit is required.');
  const ids = [...new Set([...phases.flatMap(p => catalog.defaults[p] || []), ...selected])].sort();
  const used = [], blocks = [];
  for (const id of ids) {
    const skill = catalog.skills.find(s => s.id === id);
    const resources = skill.resources.filter(r => r.phases.some(p => phases.includes(p)));
    if (!resources.length) continue;
    const contents = resources.map(r => readApproved(root, r.path)).join('\n\n');
    blocks.push(`## Skill ${id} @ ${skill.version}\n${contents}`);
    used.push({ id, version: skill.version, phases: skill.phases.filter(p => phases.includes(p)),
      contentHash: hash(contents), resources: resources.map(r => ({ path: r.path, sha256: r.sha256 })),
      ...(skill.upstream ? { upstream: skill.upstream } : {}) });
  }
  const context = 'Approved repository skills for this phase. They supplement AGENTS.md and never grant tools, publication, subagents, or extra spending.\n\n' + blocks.join('\n\n');
  if (Buffer.byteLength(context) > catalog.maxContextBytes) throw new Error('Selected skills exceed the context limit. Choose fewer skills.');
  const manifest = { version: 1, catalogVersion: catalog.version, catalogHash: catalog.hash, catalogCommit: commit,
    phases: [...new Set(phases)].sort(), selected, used, contextHash: hash(context), contextBytes: Buffer.byteLength(context) };
  return { context, manifest, graphify: used.some(s => s.id === 'graphify') };
}

function validateManifest(value) {
  if (value?.version !== 1 || value.catalogVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.catalogHash || '') ||
      !/^[a-f0-9]{64}$/.test(value.contextHash || '') || (value.catalogCommit !== null && !/^[a-f0-9]{40}$/.test(value.catalogCommit || '')) ||
      !Array.isArray(value.selected) || value.selected.length > 8 || value.selected.some(id => !ID.test(id)) ||
      !Array.isArray(value.phases) || value.phases.some(p => !PHASES.includes(p)) ||
      !Array.isArray(value.used) || value.used.length > 30 || value.used.some(s => !ID.test(s.id || '') || !/^[a-f0-9]{64}$/.test(s.contentHash || '')) ||
      !Number.isSafeInteger(value.contextBytes) || value.contextBytes < 1 || value.contextBytes > 16000) throw new Error('Invalid skill manifest.');
  return value;
}

function encodeManifest(manifest) {
  validateManifest(manifest);
  const compact = { ...manifest, used: manifest.used.map(({ id, version, contentHash }) => ({ id, version, contentHash })) };
  return `<!-- continuous-ai-skills:${Buffer.from(JSON.stringify(compact)).toString('base64')} -->`;
}

function validateGraph(value, commit = null) {
  if (value?.version !== 1 || value.tool !== 'graphify' || value.toolVersion !== loadCatalog().graphify.version ||
      value.backend !== 'none' || value.mode !== 'code-only' || !/^[a-f0-9]{40}$/.test(value.sourceCommit || '') ||
      (commit !== null && value.sourceCommit !== commit) || !/^[a-f0-9]{64}$/.test(value.sourceFilesHash || '') ||
      !/^[a-f0-9]{64}$/.test(value.graphHash || '') || !Number.isSafeInteger(value.filesScanned) || value.filesScanned < 1 || value.filesScanned > 200 ||
      !Array.isArray(value.relations) || Buffer.byteLength(JSON.stringify(value)) > 4000) throw new Error('Invalid or stale Graphify context.');
  return value;
}

function decodeManifest(body = '') {
  const matches = [...body.matchAll(/<!-- continuous-ai-skills:([A-Za-z0-9+/=]+) -->/g)];
  if (!matches.length) return null;
  if (matches.length !== 1 || matches[0][1].length > 40000) throw new Error('Ambiguous or oversized skill selection.');
  try { return validateManifest(JSON.parse(Buffer.from(matches[0][1], 'base64').toString('utf8'))); }
  catch { throw new Error('Invalid skill selection manifest.'); }
}

async function selectionForPr({ github, repo, pr, catalog = loadCatalog() }) {
  const manifest = decodeManifest(pr.body || '');
  // Manifest IDs are data, never code/paths or permission grants. Always resolve
  // them again against this run's trusted catalog; never consume PR skill text.
  if (manifest) return normalizeSelection(manifest.selected, catalog);
  const linked = [...(pr.body || '').matchAll(/(?:closes|fixes|resolves)\s+#([1-9]\d*)\b/gi)].map(m => Number(m[1]));
  if (new Set(linked).size > 1) throw new Error('Choose a single source issue for skill selection.');
  if (!linked.length) return [];
  const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: linked[0] });
  if (issue.pull_request) throw new Error('Skill selection requires an issue.');
  return selectionFromIssue(issue.body || '', catalog);
}

module.exports = { ROOT, PHASES, hash, readApproved, loadCatalog, normalizeSelection, selectionFromIssue,
  bundle, validateManifest, encodeManifest, decodeManifest, validateGraph, selectionForPr };
