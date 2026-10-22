const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const skills = require('../skills.cjs');
const SHA = 'a'.repeat(40);
const issueBody = selected => `### Critérios de aceite\n- [ ] Manter a API.\n\n### Skills\n${selected}\n\n### Escopo\nSomente aplicação.`;

function catalogCopy(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-catalog-'));
  fs.cpSync(path.join(skills.ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'));
  fs.copyFileSync(path.join(skills.ROOT, 'config/skills-catalog.json'), path.join(root, 'config/skills-catalog.json'));
  try { callback(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('issue form IDs, aliases, comma lists and legacy defaults produce deterministic selection', () => {
  assert.deepEqual(skills.selectionFromIssue(issueBody('superpower, grapify\n- postgres-flyway')), ['graphify', 'postgres-flyway', 'superpowers']);
  assert.deepEqual(skills.selectionFromIssue(issueBody('_No response_')), []);
  assert.deepEqual(skills.selectionFromIssue('A legacy issue with no selector.'), []);
  const first = skills.bundle({ selection: ['superpowers', 'postgres-flyway'], phases: ['implementation', 'testing'], commit: SHA });
  const second = skills.bundle({ selection: ['postgres-flyway', 'superpowers', 'superpowers'], phases: ['implementation', 'testing'], commit: SHA });
  assert.deepEqual(first, second);
  assert(first.manifest.used.some(s => s.id === 'integration-tests'));
  assert(first.context.includes('Skill java-spring-api'));
  assert(!first.context.includes('references/review.md'));
});

test('selection ignores fenced examples and rejects ambiguity, paths, URLs and unknown IDs', () => {
  assert.deepEqual(skills.selectionFromIssue('```md\n### Skills\nnot-real\n```\n' + issueBody('grill-me')), ['grill-me']);
  assert.throws(() => skills.selectionFromIssue(issueBody('grill-me') + '\n### Skills\ngraphify'), /Duplicate/);
  for (const value of ['../../secrets', 'https://malicious.invalid/SKILL.md', 'unknown-skill', 'fake_key_123']) {
    assert.throws(() => skills.selectionFromIssue(issueBody(value)), error => !error.message.includes(value));
  }
  assert.throws(() => skills.normalizeSelection(Array(9).fill('grill-me'), skills.loadCatalog()), /eight/);
});

test('phase filtering makes specification-only skills unavailable to the reviewer', () => {
  const review = skills.bundle({ selection: ['grill-me', 'superpowers'], phases: ['review'], commit: SHA });
  assert(!review.manifest.used.some(s => s.id === 'grill-me'));
  assert(review.manifest.used.some(s => s.id === 'superpowers'));
  assert(!review.context.includes('name: grill-me'));
  assert(review.context.includes('name: code-review'));
  const spec = skills.bundle({ phases: ['specification'] });
  assert(spec.context.includes('name: grill-me'));
  assert(!spec.context.includes('name: java-spring-api'));
  assert.notEqual(spec.manifest.contextHash, review.manifest.contextHash);
});

test('catalog rejects changed content, symlinks and path traversal before loading a prompt', () => {
  catalogCopy(root => {
    fs.appendFileSync(path.join(root, 'skills/code-review/SKILL.md'), '\nInjected content.');
    assert.throws(() => skills.bundle({ root, phases: ['review'] }), /integrity/);
  });
  catalogCopy(root => {
    const source = path.join(root, 'skills/code-review/SKILL.md');
    fs.renameSync(source, source + '.saved'); fs.symlinkSync(source + '.saved', source);
    assert.throws(() => skills.bundle({ root, phases: ['review'] }), /symlink/);
    assert.throws(() => skills.readApproved(root, 'skills/../../AGENTS.md'), /Invalid/);
  });
});

test('combined UTF-8 skill context fails rather than silently dropping selected resources', () => {
  catalogCopy(root => {
    const file = path.join(root, 'config/skills-catalog.json');
    const catalog = JSON.parse(fs.readFileSync(file));
    const skill = catalog.skills.find(s => s.id === 'code-review');
    const content = 'é'.repeat(9000);
    fs.writeFileSync(path.join(root, skill.resources[0].path), content);
    skill.resources[0].sha256 = skills.hash(content);
    fs.writeFileSync(file, JSON.stringify(catalog));
    assert.throws(() => skills.bundle({ root, phases: ['review'] }), /context limit/);
  });
});

test('PR selection persists IDs while re-resolving content from the trusted catalog', async () => {
  const bundle = skills.bundle({ selection: ['superpowers', 'postgres-flyway'], phases: ['implementation', 'testing'], commit: SHA });
  const repo = { owner: 'example', repo: 'catalog' };
  const pr = { body: 'Closes #99\n' + skills.encodeManifest(bundle.manifest) };
  const selected = await skills.selectionForPr({ repo, pr, github: { rest: { issues: { get: () => assert.fail('Frozen IDs should not change with the issue.') } } } });
  assert.deepEqual(selected, ['postgres-flyway', 'superpowers']);
  const forged = { ...bundle.manifest, used: [{ id: 'code-review', version: '999', contentHash: '0'.repeat(64), resources: [{ path: '/tmp/inject' }] }] };
  const fromForged = await skills.selectionForPr({ repo, pr: { body: skills.encodeManifest(forged) }, github: {} });
  const resolved = skills.bundle({ selection: fromForged, phases: ['review'] });
  assert(!resolved.context.includes('/tmp/inject'));
  assert(!resolved.context.includes('@ 999'));
  assert(resolved.manifest.used.some(s => s.id === 'postgres-flyway'));
  await assert.rejects(skills.selectionForPr({ repo, github: {}, pr: { body: pr.body + '\n' + skills.encodeManifest(bundle.manifest) } }), /Ambiguous/);
});

test('legacy PR links resolve one issue and ambiguous sources fail before an inference', async () => {
  const github = { rest: { issues: { get: async ({ issue_number }) => {
    assert.equal(issue_number, 45); return { data: { body: issueBody('postgres-flyway') } };
  } } } };
  const repo = { owner: 'example', repo: 'catalog' };
  assert.deepEqual(await skills.selectionForPr({ github, repo, pr: { body: 'Closes #45' } }), ['postgres-flyway']);
  assert.deepEqual(await skills.selectionForPr({ github, repo, pr: { body: 'Legacy PR without linked issue.' } }), []);
  await assert.rejects(skills.selectionForPr({ github, repo, pr: { body: 'Fixes #45, resolves #46' } }), /single source/);
});

test('trusted publisher freezes selection in the PR body and refuses arbitrary skill paths', () => {
  const { appendSelection } = require('../publish-skill-selection.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-publisher-'));
  const file = path.join(directory, 'pr.md');
  try {
    fs.writeFileSync(file, 'Closes #45\n');
    appendSelection(file, { selected: '["superpower","postgres-flyway"]', commit: SHA });
    assert.deepEqual(skills.decodeManifest(fs.readFileSync(file, 'utf8')).selected, ['postgres-flyway', 'superpowers']);
    assert.throws(() => appendSelection(file, { selected: '[]', commit: SHA }), /already published/);
    assert.throws(() => appendSelection(file, { selected: '["../../etc/passwd"]', commit: SHA }), /IDs/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Graphify context must use the pinned AST tool, no backend and the trusted source commit', () => {
  const graph = { version: 1, tool: 'graphify', toolVersion: skills.loadCatalog().graphify.version, backend: 'none', mode: 'code-only',
    sourceCommit: SHA, sourceFilesHash: 'c'.repeat(64), graphHash: 'd'.repeat(64), filesScanned: 1, relations: [] };
  assert.equal(skills.validateGraph(graph, SHA), graph);
  for (const change of [{ sourceCommit: 'b'.repeat(40) }, { backend: 'anthropic' }, { toolVersion: '0.0.1' },
    { filesScanned: 201 }, { relations: ['x'.repeat(4000)] }]) assert.throws(() => skills.validateGraph({ ...graph, ...change }, SHA), /Invalid or stale/);
});

test('reviewer sees selected approved skills, keeps tools denied, records manifest and rejects tampering', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-review-'));
  try {
    const { runReview } = await import('../run-review.mjs');
    const manifest = skills.bundle({ selection: ['postgres-flyway', 'superpowers'], phases: ['review'], commit: SHA }).manifest;
    fs.writeFileSync(path.join(directory, 'context.txt'), 'FILE: Product.java\n@@ -1 +1 @@\n-old\n+new');
    const metadata = { skills: manifest };
    fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata));
    const options = { env: { MODEL: 'anthropic/claude-sonnet-4-6', REVIEW_DIRECTORY: directory }, outputDirectory: path.join(directory, 'output'),
      run: async (args, options) => {
        assert(args[1].includes('name: postgres-flyway'));
        assert(args[1].includes('name: superpowers'));
        assert.equal(args[args.indexOf('--agent') + 1], 'reviewer');
        assert.equal(options.profile, 'review');
        return { status: 0, stdout: JSON.stringify({ type: 'text', part: { text: JSON.stringify({ summary: 'Revisado.', findings: [] }) } }) };
      } };
    await runReview(options);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(options.outputDirectory, 'skills-manifest.json'))), manifest);
    metadata.skills.contextHash = '0'.repeat(64);
    fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata));
    await assert.rejects(runReview({ ...options, run: () => assert.fail('Invalid provenance cannot reach the model.') }), /integrity/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
