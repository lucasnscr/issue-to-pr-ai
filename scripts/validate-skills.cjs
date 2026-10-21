const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const skills = require('./skills.cjs');

function validate(root = skills.ROOT) {
  root = fs.realpathSync(root);
  const catalog = skills.loadCatalog(root);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'skills/upstream.lock.json'), 'utf8'));
  assert.equal(lock.version, 1);
  for (const [id, source] of Object.entries(lock.sources)) {
    assert(/^[a-z0-9-]+$/.test(id) && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source.repository));
    assert(/^[a-f0-9]{40}$/.test(source.commit) && ['MIT', 'Apache-2.0'].includes(source.license));
    assert(source.files.some(f => f.upstreamPath === 'LICENSE'), 'Upstream license must be preserved.');
    if (source.license === 'Apache-2.0') assert(source.files.some(f => f.upstreamPath === 'NOTICE'));
    for (const file of source.files) {
      assert.equal(file.path, `skills/upstream/${id}/${file.upstreamPath}`);
      assert(!file.path.includes('\\') && !file.path.split('/').some(p => ['.', '..', ''].includes(p)));
      const absolute = path.join(root, file.path);
      assert.equal(fs.realpathSync(absolute), absolute, 'Upstream paths cannot be symlinks.');
      assert.equal(skills.hash(fs.readFileSync(absolute)), file.sha256, 'Pinned upstream content changed.');
    }
  }
  for (const skill of catalog.skills) {
    const resource = skill.resources.find(r => r.path === `skills/${skill.id}/SKILL.md`);
    assert(resource, 'Each registered skill needs a SKILL.md.');
    const content = skills.readApproved(root, resource.path);
    const frontmatter = content.match(/^---\n([\s\S]+?)\n---\n/);
    assert(frontmatter, 'Skill frontmatter is required.');
    assert(frontmatter[1].includes(`name: ${skill.id}\n`));
    assert(/^description: .+$/m.test(frontmatter[1]), 'A focused description is required.');
    if (skill.upstream) assert(Object.values(lock.sources).some(s =>
      s.repository === skill.upstream.repository && s.commit === skill.upstream.commit && s.license === skill.upstream.license), 'Adapted skills require pinned source and license provenance.');
  }
  for (const phase of skills.PHASES) assert(catalog.defaults[phase]?.length);
  for (const [alias, id] of Object.entries(catalog.aliases)) {
    assert(/^[a-z0-9-]+$/.test(alias) && !catalog.skills.some(s => s.id === alias));
    assert(catalog.skills.some(s => s.id === id));
  }
  assert.equal(catalog.graphify.package, 'graphifyy');
  assert.equal(catalog.graphify.maxContextBytes, 4000);
  assert.equal(catalog.graphify.maxFiles, 200);
  assert.equal(catalog.graphify.timeoutSeconds, 120);
  assert(fs.readFileSync(path.join(root, '.github/actions/prepare-skill-graph/action.yml'), 'utf8').includes(`'graphifyy==${catalog.graphify.version}'`));
  assert(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').includes(`'graphifyy==${catalog.graphify.version}'`));
  return { skills: catalog.skills.length, sources: Object.keys(lock.sources).length };
}
module.exports = { validate };
if (require.main === module) console.log(JSON.stringify(validate()));
