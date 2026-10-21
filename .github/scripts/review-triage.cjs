const { createHash } = require('node:crypto');
const { SHA, integer } = require('./review-report.cjs');

const BOT = 'github-actions[bot]';
const REQUIRED = '<!-- continuous-ai-review-required:v1 -->';
const MARKER = '<!-- continuous-ai-triage:v1 -->';
const hash = value => createHash('sha256').update(value).digest('hex');
const findingId = finding => 'f-' + hash(JSON.stringify([
  finding.priority, finding.path, finding.line, finding.title, finding.body,
])).slice(0, 16);
const cycleId = state => 'cycle-' + hash(JSON.stringify(state)).slice(0, 16);

function parseCommand(body) {
  if (typeof body !== 'string' || body.length > 2500) return null;
  const match = body.trim().match(/^\/ai-triage\s+([a-f0-9]{40})\s+([1-9]\d*)\s+(f-[a-f0-9]{16}|cycle-[a-f0-9]{16})\s+(confirm|dismiss|investigate|acknowledge)\s+([\s\S]+)$/);
  if (!match) return null;
  const value = { sha: match[1], reviewRunId: Number(match[2]), target: match[3], action: match[4], reason: match[5].trim() };
  if (!integer(value.reviewRunId) || value.reason.length < 10 || value.reason.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.reason) ||
      value.target.startsWith('cycle-') !== (value.action === 'acknowledge')) return null;
  return value;
}

function validateReceipt(value) {
  if (value?.version !== 1 || !integer(value.pr) || !SHA.test(value.sha || '') || !integer(value.reviewRunId) ||
      !integer(value.sourceCommentId) || !integer(value.workerRunId) || !integer(value.workerRunAttempt) ||
      !/^[a-f0-9]{64}$/.test(value.sourceHash || '') || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.actor || '') ||
      typeof value.repository !== 'string' || value.repository.length > 200 || typeof value.reason !== 'string' ||
      !parseCommand(`/ai-triage ${value.sha} ${value.reviewRunId} ${value.target} ${value.action} ${value.reason}`)) throw new Error('Invalid triage receipt.');
  return value;
}

function decodeReceipt(body) {
  const encoded = body.match(/<!-- continuous-ai-triage-data:([A-Za-z0-9+/=]+) -->/);
  if (!encoded || encoded[1].length > 12000) throw new Error('Missing or oversized triage receipt.');
  return validateReceipt(JSON.parse(Buffer.from(encoded[1], 'base64').toString('utf8')));
}

function renderReceipt(value) {
  validateReceipt(value);
  const reason = value.reason.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('@', '@\u200b').split('\n').map(line => `> ${line}`).join('\n');
  return `${MARKER}\nTriagem registrada para \`${value.sha}\`, revisão ${value.reviewRunId}, alvo \`${value.target}\`.\n\n` +
    `Decisão: **${value.action}**. Ator: \`${value.actor}\`. Comentário de origem: ${value.sourceCommentId}.\n\n${reason}\n\n` +
    'Decisão vinculada a este commit; não aprova nem integra a PR.\n\n' +
    `<!-- continuous-ai-triage-data:${Buffer.from(JSON.stringify(value)).toString('base64')} -->`;
}

module.exports = { BOT, REQUIRED, MARKER, hash, findingId, cycleId, parseCommand, validateReceipt, decodeReceipt, renderReceipt };
