const fs = require('node:fs');
const path = require('node:path');
const skills = require('../../scripts/skills.cjs');
const COMMAND = /^\/ai-spec(?=\s|$)/i;
const canWrite = permission => ['write', 'maintain', 'admin'].includes(permission);
const issueHash = issue => skills.hash(JSON.stringify([issue.title, issue.body]));
const marker = id => `<!-- continuous-ai-spec:${id} -->`;
const ownResult = (comment, id) => comment.user?.login === 'github-actions[bot]' &&
  comment.user.type === 'Bot' && comment.body?.includes(marker(id));

async function current({ github, context, metadata }) {
  const issueNumber = metadata?.issue || context.payload.issue?.number;
  const commentId = metadata?.commentId || context.payload.comment?.id;
  const actor = metadata?.actor || context.actor;
  const repo = context.repo;
  const { data: access } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: actor });
  if (!canWrite(access.permission)) throw new Error('Write access is required for specification.');
  const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: issueNumber });
  const { data: comment } = await github.rest.issues.getComment({ ...repo, comment_id: commentId });
  if (issue.pull_request || issue.state !== 'open') throw new Error('Specification requires an open issue.');
  if (comment.user?.type !== 'User' || comment.user.login !== actor || !COMMAND.test(comment.body?.trimStart() || '')) throw new Error('A current human /ai-spec request is required.');
  if (!issue.body?.trim() || issue.body.length > 20000 || comment.body.length > 12000) throw new Error('Specification input is empty or oversized.');
  if (comment.issue_url && !comment.issue_url.endsWith(`/issues/${issueNumber}`)) throw new Error('Request belongs to another issue.');
  if (metadata && (issueHash(issue) !== metadata.issueHash || skills.hash(comment.body) !== metadata.commentHash)) throw new Error('Issue or request changed; discard stale specification and request a new round.');
  return { issue, comment };
}

async function prepare({ github, context, core }) {
  core.setOutput('ready', 'false');
  const event = context.payload.comment;
  if (event?.user?.type !== 'User' || event.user.login !== context.actor || !COMMAND.test(event.body?.trimStart() || '')) return;
  const { issue, comment } = await current({ github, context });
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: issue.number, per_page: 100 });
  if (comments.some(c => ownResult(c, comment.id))) { core.notice('This specification request has already been answered.'); return; }
  const { data: base } = await github.rest.repos.getCommit({ ...context.repo, ref: context.payload.repository.default_branch });
  if (base.sha !== process.env.CHECKOUT_SHA) throw new Error('The trusted base moved. Request a new specification round.');
  const skillBundle = skills.bundle({ selection: skills.selectionFromIssue(issue.body), phases: ['specification'], commit: base.sha });
  const directory = path.join(process.env.RUNNER_TEMP, `specification-${comment.id}`);
  fs.mkdirSync(directory, { recursive: true });
  const metadata = { version: 1, issue: issue.number, actor: context.actor, commentId: comment.id,
    issueHash: issueHash(issue), commentHash: skills.hash(comment.body), skills: skillBundle.manifest };
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2));
  fs.writeFileSync(path.join(directory, 'skills-manifest.json'), JSON.stringify(skillBundle.manifest, null, 2));
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify({ title: issue.title, body: issue.body, request: comment.body }));
  core.setOutput('directory', directory);
  core.setOutput('ready', 'true');
}

function validateResult(result) {
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!result || !text(result.summary, 1200) || !['needs-input', 'draft-ready'].includes(result.status) ||
      !Array.isArray(result.questions) || result.questions.length > 5 ||
      result.questions.some(q => !text(q.id, 50) || !text(q.question, 600) || !text(q.recommendation, 600) || !text(q.effect, 400)) ||
      new Set(result.questions.map(q => q.id)).size !== result.questions.length ||
      !Array.isArray(result.proposedAcceptanceCriteria) || result.proposedAcceptanceCriteria.length > 10 ||
      result.proposedAcceptanceCriteria.some(c => !text(c, 600)) ||
      (result.status === 'needs-input' && !result.questions.length) ||
      (result.status === 'draft-ready' && (result.questions.length || !result.proposedAcceptanceCriteria.length))) throw new Error('Invalid structured specification result.');
  return { summary: result.summary, status: result.status,
    questions: result.questions.map(({ id, question, recommendation, effect }) => ({ id, question, recommendation, effect })),
    proposedAcceptanceCriteria: result.proposedAcceptanceCriteria };
}

// Escape model output as text. Only the publisher writes the trusted marker.
const safe = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/@/g, '@\u200b').replace(/([\\`*_\[\]#])/g, '\\$1');
function render(result, manifest) {
  const lines = ['**Especificação assistida — proposta para decisão humana**', '', safe(result.summary), ''];
  for (const question of result.questions) lines.push(`- **${safe(question.id)}:** ${safe(question.question)} Recomendação: ${safe(question.recommendation)} Impacto: ${safe(question.effect)}`);
  if (result.proposedAcceptanceCriteria.length) lines.push('', '**Critérios propostos:**', '', ...result.proposedAcceptanceCriteria.map(c => `- ${safe(c)}`));
  lines.push('', result.status === 'needs-input' ? 'Responda em um novo comentário `/ai-spec` com as decisões e o contexto necessário, ou atualize a issue antes da próxima rodada.' : 'Revise os critérios e incorpore as decisões na issue antes de solicitar a implementação.',
    'Esta proposta não altera a issue nem inicia implementação. A autorização continua exigindo `ai:ready` e `/oc` ou `@claude`.',
    '', `Skills: ${manifest.used.map(s => s.id + '@' + s.version).join(', ')}. Catálogo: \`${manifest.catalogHash}\`.`);
  return lines.join('\n');
}

async function publish({ github, context, core, directory = process.env.SPEC_DIRECTORY, outputDirectory = 'artifacts' }) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
  await current({ github, context, metadata });
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: metadata.issue, per_page: 100 });
  if (comments.some(c => ownResult(c, metadata.commentId))) { core.notice('Specification already published.'); return; }
  const manifest = skills.validateManifest(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'skills-manifest.json'), 'utf8')));
  if (manifest.contextHash !== metadata.skills.contextHash || manifest.catalogHash !== metadata.skills.catalogHash) throw new Error('Specification skill provenance changed.');
  const usage = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'ai-usage.json'), 'utf8'));
  if (usage.profile !== 'specification' || usage.outcome !== 'completed' || usage.policy?.decision !== 'allow' || usage.usage?.complete !== true) throw new Error('Specification requires complete allowed usage telemetry.');
  const { loadPolicy, assertUsageAllowed } = await import('../../scripts/ai-policy.mjs');
  assertUsageAllowed(loadPolicy('specification', usage.model), usage.usage);
  const result = validateResult(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'specification.json'), 'utf8')));
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  await github.rest.issues.createComment({ ...context.repo, issue_number: metadata.issue,
    body: `${marker(metadata.commentId)}\n${render(result, manifest)}\n\n[Execução e artefatos](${runUrl})` });
}

module.exports = { prepare, publish, validateResult, render, current };
