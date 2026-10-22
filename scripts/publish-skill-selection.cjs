const fs = require('node:fs');
const skills = require('./skills.cjs');

// Run in the fresh publisher checkout. Consume IDs from the authorized job
// output, never a model-produced manifest, path, skill body or PR instruction.
function appendSelection(file, { selected = process.env.SELECTED_SKILLS, commit = process.env.CATALOG_COMMIT } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('A trusted publisher commit is required.');
  const { manifest } = skills.bundle({ selection: JSON.parse(selected), phases: ['implementation', 'testing'], commit });
  if (skills.decodeManifest(fs.readFileSync(file, 'utf8'))) throw new Error('Skill selection already published.');
  fs.appendFileSync(file, '\nSkills selecionadas: ' + (manifest.selected.join(', ') || 'padrões do catálogo') + '.\n\n' + skills.encodeManifest(manifest) + '\n');
  return manifest;
}

module.exports = { appendSelection };
if (require.main === module) appendSelection(process.argv[2]);
