import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const historical = [
  ['[demo] Filtrar produtos por categoria', '01-category-filter.md'],
  ['[demo] Filtrar produtos por faixa de preço', '02-price-range.md'],
  ['[demo] Ordenar produtos por preço', '03-price-ordering.md'],
];
const args = process.argv.slice(2);
const next = ['[demo] Listar categorias presentes no catálogo', '04-list-categories.md'];
const examples = args.includes('--historical') ? [...historical, next] : [next];
if (!args.includes('--create')) {
  console.log('Prévia histórica: os quatro exercícios já estão implementados nesta referência. Nenhuma issue será criada.\n');
  for (const [title, file] of examples) console.log(`${title}\n  docs/demo-issues/${file}`);
  console.log('\nSomente para laboratório histórico em outra base: --create --acknowledge-historical --repo OWNER/REPOSITORY');
  process.exit(0);
}
if (!args.includes('--acknowledge-historical')) throw new Error('Os exercícios já estão implementados. Use --acknowledge-historical apenas para reproduzir um laboratório histórico em uma base apropriada.');
const repository = args[args.indexOf('--repo') + 1];
if (!args.includes('--repo') || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
  throw new Error('Informe --repo OWNER/REPOSITORY explicitamente.');
}
function gh(command, input) {
  const result = spawnSync('gh', command, { input, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || 'gh failed');
  return result.stdout;
}
gh(['label', 'create', 'ai:ready', '--repo', repository, '--color', '0e8a16',
  '--description', 'Tarefa autorizada para implementação por IA', '--force']);
const existing = JSON.parse(gh(['issue', 'list', '--repo', repository, '--state', 'all', '--limit', '1000', '--json', 'title']));
for (const [title, file] of examples) {
  if (existing.some(issue => issue.title === title)) { console.log(`Já existe: ${title}`); continue; }
  const body = readFileSync(fileURLToPath(new URL(`../docs/demo-issues/${file}`, import.meta.url)), 'utf8');
  // The maintainer adds ai:ready after reviewing each task. No agent is triggered here.
  console.log(gh(['issue', 'create', '--repo', repository, '--title', title, '--body-file', '-'], body).trim());
}
