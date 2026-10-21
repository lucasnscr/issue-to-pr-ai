const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const skills = require('../skills.cjs');
const helper = path.join(skills.ROOT, 'scripts/graphify-context.py');

function fixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-context-'));
  const source = 'apps/catalog-api/src/main/java/Price.java';
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (relative, content) => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), content); };
  write('config/skills-catalog.json', fs.readFileSync(path.join(skills.ROOT, 'config/skills-catalog.json')));
  write(source, 'class Price {}\n');
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '-m', 'trusted fixture');
  const sha = git('rev-parse', 'HEAD').trim();
  const command = path.join(root, 'fake-graphify');
  function cli({ version = '0.9.93', tokens = 0 } = {}) {
    fs.writeFileSync(command, `#!/usr/bin/env python3
import json, os, pathlib, sys
if '--version' in sys.argv:
    print('graphify ${version}'); sys.exit(0)
assert sys.argv[1:] == ['extract', '.', '--code-only', '--no-cluster', '--no-viz']
assert os.environ['GRAPHIFY_BACKEND'] == 'none'
assert all(key not in os.environ for key in ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'OPENCODE_CONFIG'])
assert not pathlib.Path('.git').exists()
assert not pathlib.Path('apps/catalog-api/src/main/java/Untracked.java').exists()
nodes = [{'id': 'a', 'label': 'Preço'}, {'id': 'b', 'label': 'BigDecimal'}]
edges = [{'source': 'a', 'target': 'b', 'relation': 'imports', 'confidence': 'EXTRACTED', 'source_file': '${source}', 'source_location': 'L2'} for _ in range(100)]
edges += [{'source': 'a', 'target': 'b', 'source_file': '/etc/passwd'}]
pathlib.Path('graphify-out').mkdir()
pathlib.Path('graphify-out/graph.json').write_text(json.dumps({'nodes': nodes, 'edges': edges, 'input_tokens': ${tokens}, 'output_tokens': 0}))
`);
    fs.chmodSync(command, 0o755);
  }
  cli();
  const output = path.join(root, 'context.json');
  const run = () => spawnSync('python3', [helper, '--root', root, '--command', command, '--output', output, '--focus', source],
    { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: 'FAKE_PROVIDER', GH_TOKEN: 'FAKE_GITHUB', AWS_SECRET_ACCESS_KEY: 'FAKE_CLOUD', OPENCODE_CONFIG: '/tmp/untrusted-config' } });
  try { callback({ root, source, sha, write, git, cli, run, output }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('graph helper isolates tracked trusted code, removes credentials and bounds UTF-8 relations with provenance', () => fixture(s => {
  s.write('apps/catalog-api/src/main/java/Untracked.java', 'untracked malicious content');
  const result = s.run();
  assert.equal(result.status, 0, result.stderr);
  const graph = JSON.parse(fs.readFileSync(s.output));
  assert.equal(graph.sourceCommit, s.sha);
  assert.equal(graph.filesScanned, 1);
  assert.equal(graph.edgeCount, 101);
  assert(graph.omittedEdges > 0);
  assert(graph.relations.length > 0);
  assert(graph.relations.every(edge => edge.file === s.source && edge.confidence === 'EXTRACTED'));
  assert(Buffer.byteLength(JSON.stringify(graph)) <= 4000);
  skills.validateGraph(graph, s.sha);
  assert.equal(s.git('diff'), '');
}));

test('graph helper refuses dirty trusted files, an unapproved CLI version or semantic token use', () => {
  for (const mode of ['dirty', 'version', 'tokens']) fixture(s => {
    if (mode === 'dirty') s.write(s.source, 'class Changed {}');
    if (mode === 'version') s.cli({ version: '0.0.0' });
    if (mode === 'tokens') s.cli({ tokens: 1 });
    const result = s.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no model call is authorized/);
    assert(!fs.existsSync(s.output));
    assert(!result.stderr.includes('FAKE_PROVIDER'));
  });
});

test('graph attachment is skipped for unselected skills and refuses a modified phase manifest', async () => {
  const { attach } = await import('../attach-skill-graph.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-attach-'));
  try {
    const manifestFile = path.join(directory, 'skills.json');
    const manifest = skills.bundle({ phases: ['implementation', 'testing'], commit: 'a'.repeat(40) }).manifest;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.equal(attach({ manifestFile, target: path.join(directory, 'task.md'), kind: 'implementation', command: '/does/not/exist' }), null);
    manifest.contextHash = '0'.repeat(64);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.throws(() => attach({ manifestFile, target: directory, kind: 'review' }), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
