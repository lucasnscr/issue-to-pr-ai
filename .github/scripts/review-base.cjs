const fs = require('node:fs');
const path = require('node:path');

// Read only the trusted checkout, never a PR ref or an arbitrary attachment path.
module.exports = (files, { root = process.cwd(), budget = 12000 } = {}) => {
  const base = fs.realpathSync(root);
  let text = '';
  const productPackage = 'dev/continuousai/catalog/product/';
  const productChange = files.some(file => ['main', 'test'].some(source =>
    file.filename.startsWith(`apps/catalog-api/src/${source}/java/${productPackage}`)));
  const dependencies = productChange ? ['Product.java', 'ProductRequest.java'].map(name => ({
    filename: `apps/catalog-api/src/main/java/${productPackage}${name}`,
  })) : [];
  // A service diff may rely on normalization performed by an unchanged entity.
  // Reserve context for these fixed trusted callees before larger test excerpts.
  const ordered = [...dependencies, ...[...files].sort((a, b) =>
    Number(b.filename.includes('/src/test/')) - Number(a.filename.includes('/src/test/')))];
  const seen = new Set();
  for (const file of ordered) {
    if (seen.has(file.filename)) continue;
    seen.add(file.filename);
    if (!/^apps\/catalog-api\/src\/(main|test)\/java\/[A-Za-z0-9_./$-]+\.java$/.test(file.filename)) continue;
    const candidate = path.resolve(base, file.filename);
    let stat;
    try {
      stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 120000 ||
          !fs.realpathSync(candidate).startsWith(base + path.sep)) continue;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const lines = fs.readFileSync(candidate, 'utf8').split('\n');
    const selected = lines.length <= 115 ? lines.map((_, index) => index) :
      [...Array.from({ length: 75 }, (_, index) => index), ...Array.from({ length: 40 }, (_, index) => lines.length - 40 + index)];
    const excerpt = `\nTRUSTED BASE EXCERPT: ${file.filename}\n` +
      selected.map((index, position) => `${position === 75 && lines.length > 115 ? '[unchanged middle omitted]\n' : ''}${index + 1}: ${lines[index]}`).join('\n') + '\n';
    if (Buffer.byteLength(text + excerpt) <= budget) text += excerpt;
  }
  return text;
};
