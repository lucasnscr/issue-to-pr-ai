const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const excerpts = require('../../.github/scripts/review-base.cjs');

test('trusted base excerpts retain test lifecycle and helpers outside changed lines', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-base-'));
  const filename = 'apps/catalog-api/src/test/java/example/ProductIT.java';
  try {
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    const lines = Array.from({ length: 250 }, (_, index) => `line ${index + 1}`);
    lines[35] = '@BeforeEach void cleanDatabase() { repository.deleteAll(); }';
    lines[235] = 'void createWithCategory() {}';
    fs.writeFileSync(path.join(root, filename), lines.join('\n'));
    const context = excerpts([{ filename }], { root });
    assert(context.includes('36: @BeforeEach'));
    assert(context.includes('236: void createWithCategory'));
    assert(context.includes('[unchanged middle omitted]'));
    assert(!context.includes('line 150'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('excerpts never follow source symlinks or read arbitrary repository files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-base-scope-'));
  const filename = 'apps/catalog-api/src/main/java/Unsafe.java';
  try {
    fs.writeFileSync(path.join(root, '.env'), 'DO_NOT_READ');
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    fs.symlinkSync(path.join(root, '.env'), path.join(root, filename));
    assert.equal(excerpts([{ filename }, { filename: '.env' }, { filename: '../../credentials.java' }], { root }), '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('base context respects its byte budget and skips newly added files absent from base', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-base-limit-'));
  const filename = 'apps/catalog-api/src/main/java/Large.java';
  try {
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
    fs.writeFileSync(path.join(root, filename), 'x'.repeat(500));
    assert.equal(excerpts([{ filename }], { root, budget: 50 }), '');
    assert.equal(excerpts([{ filename: 'apps/catalog-api/src/main/java/New.java' }], { root }), '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
