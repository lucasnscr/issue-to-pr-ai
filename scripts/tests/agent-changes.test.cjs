const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function fixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-to-pr-agent-changes-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    write('apps/catalog-api/src/main/java/Product.java', 'old source\n');
    write('apps/catalog-api/src/test/java/ProductIT.java', 'old test\n');
    write('.gitignore', 'artifacts/\n');
    git('add', '.'); git('commit', '-m', 'fixture');
    const sha = git('rev-parse', 'HEAD').trim();
    const { validateChanges } = await import('../validate-agent-changes.mjs');
    write('apps/catalog-api/src/main/java/Product.java', 'new source\n');
    write('apps/catalog-api/src/test/java/ProductIT.java', 'new test\n');
    await callback({ root, git, write, sha, validate: () => validateChanges(root, sha) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('agent patch allows source/tests/docs and ignores execution artifacts', () => fixture(({ write, validate }) => {
  write('README.md', 'Updated API contract\n');
  write('artifacts/summary.md', 'Execution summary\n');
  assert.equal(validate().length, 3);
}));

test('agent patch rejects workflow changes before generated code is executed', () => fixture(({ write, validate }) => {
  write('.github/workflows/ci.yml', 'changed: true\n');
  assert.throws(validate, /outside the task scope/);
}));

test('agent patch rejects untracked executable scripts', () => fixture(({ write, validate }) => {
  write('scripts/unknown.sh', 'echo unsafe\n');
  assert.throws(validate, /outside the task scope/);
}));

test('agent patch rejects symbolic links', () => fixture(({ root, validate }) => {
  const file = path.join(root, 'apps/catalog-api/src/main/java/Product.java');
  fs.unlinkSync(file);
  fs.symlinkSync('/tmp/unrelated-file', file);
  assert.throws(validate, /Symlink/);
}));

test('agent patch rejects commits made by the model', () => fixture(({ git, validate }) => {
  git('add', '.'); git('commit', '-m', 'model commit');
  assert.throws(validate, /changed HEAD/);
}));

test('agent patch requires changed integration tests', () => fixture(({ git, validate }) => {
  git('restore', 'apps/catalog-api/src/test/java/ProductIT.java');
  assert.throws(validate, /integration-test changes/);
}));
