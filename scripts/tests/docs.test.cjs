const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('documentation validates paths, Unicode/repeated anchors and ignores code samples and remote links', async () => {
  const { validateDocs } = await import('../validate-docs.mjs');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reference-docs-')));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Guia\n## Preparação\n## Preparação\n<a id="custom"></a>\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# Entrada\n[guia](docs/guide.md#preparação)\n[repetição](docs/guide.md#preparação-1)\n[custom](docs/guide.md#custom)\n[remoto](https://example.invalid/never-fetched)\n```md\n[exemplo](not-real.md)\n```\n');
    assert.deepEqual(validateDocs({ root, files: ['README.md', 'docs/guide.md'] }).errors, []);
    fs.appendFileSync(path.join(root, 'README.md'), '[quebrado](docs/missing.md)\n[âncora](docs/guide.md#missing)\n[fora](../private.md)\n');
    const result = validateDocs({ root, files: ['README.md'] });
    assert.equal(result.errors.length, 3);
    assert(result.errors.every(e => Number.isInteger(e.line) && e.line > 0));
    assert(result.errors.some(e => e.reason.includes('anchor')));
    assert(result.errors.some(e => e.reason.includes('escapes')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('vendored upstream text is preserved as reference and not checked as a complete local documentation tree', async () => {
  const { validateDocs } = await import('../validate-docs.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-docs-'));
  try {
    const result = validateDocs({ root, files: ['skills/upstream/example/SKILL.md'] });
    assert.equal(result.files, 0); assert.equal(result.errors.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
