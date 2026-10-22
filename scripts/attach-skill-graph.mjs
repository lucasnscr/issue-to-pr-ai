import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import skills from './skills.cjs';

export function inspectManifest(file) {
  const manifest = skills.validateManifest(JSON.parse(readFileSync(file, 'utf8')));
  const current = skills.bundle({ selection: manifest.selected, phases: manifest.phases, commit: manifest.catalogCommit });
  if (current.manifest.contextHash !== manifest.contextHash || current.manifest.catalogHash !== manifest.catalogHash) throw new Error('Skill manifest integrity changed.');
  return { manifest, enabled: current.graphify };
}

export function attach({ manifestFile, target, kind, command = 'graphify', python = 'python3' }) {
  const { manifest, enabled } = inspectManifest(manifestFile);
  if (!enabled) return null;
  if (!['implementation', 'review', 'correction', 'specification'].includes(kind)) throw new Error('Invalid graph context destination.');
  const directory = kind === 'implementation' || kind === 'correction' ? dirname(target) : target;
  mkdirSync(directory, { recursive: true });
  const output = join(directory, 'graph-context.json');
  const root = skills.ROOT;
  let focus = [];
  if (kind === 'review') {
    const metadata = JSON.parse(readFileSync(join(target, 'metadata.json'), 'utf8'));
    focus = (metadata.files || []).map(file => file.path);
  } else if (kind === 'correction') {
    focus = JSON.parse(readFileSync(target, 'utf8')).review.findings.map(f => f.path);
  }
  execFileSync(python, [fileURLToPath(new URL('./graphify-context.py', import.meta.url)), '--root', root,
    '--command', command, '--output', output, ...focus.flatMap(file => ['--focus', file])], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 140000 });
  const graph = skills.validateGraph(JSON.parse(readFileSync(output, 'utf8')), manifest.catalogCommit);
  if (kind === 'implementation') {
    const task = readFileSync(target, 'utf8');
    if (task.includes('<base_graph_context>')) throw new Error('Graph context already attached.');
    writeFileSync(target, `${task}\n\n<base_graph_context>\n${JSON.stringify(graph)}\n</base_graph_context>\n`);
  } else if (kind === 'correction') {
    const plan = JSON.parse(readFileSync(target, 'utf8'));
    plan.graphContext = graph;
    writeFileSync(target, JSON.stringify(plan, null, 2) + '\n');
  }
  return graph;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const manifestFile = value('--manifest');
  if (args.includes('--check')) console.log(`enabled=${inspectManifest(manifestFile).enabled}`);
  else attach({ manifestFile, target: value('--target'), kind: value('--kind'), command: value('--command') || 'graphify' });
}
