const SHA = /^[a-f0-9]{40}$/;
const integer = value => Number.isSafeInteger(value) && value > 0;
const bounded = (value, size) => typeof value === 'string' && value.trim() && value.length <= size;
const safePath = value => bounded(value, 240) && !/[\u0000-\u001f\u007f]/.test(value) && !value.startsWith('/') && !value.includes('\\') &&
  !value.split('/').some(part => !part || part === '..' || part === '.git');

function changedLines(patch = '') {
  const lines = [];
  let next = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) next = Number(hunk[1]);
    else if (line.startsWith('+')) lines.push(next++);
    else if (line.startsWith(' ')) lines.push(next++);
  }
  return lines;
}

function validateReview(value, files) {
  if (!value || Object.keys(value).some(key => !['summary', 'findings'].includes(key)) ||
      !bounded(value.summary, 1200) || !Array.isArray(value.findings) || value.findings.length > 10) {
    throw new Error('Review must contain a bounded summary and at most ten structured findings.');
  }
  const seen = new Set();
  for (const finding of value.findings) {
    if (!finding || Object.keys(finding).some(key => !['priority', 'title', 'body', 'path', 'line'].includes(key)) ||
        !['P0', 'P1', 'P2', 'P3'].includes(finding.priority) || !bounded(finding.title, 160) ||
        !bounded(finding.body, 1500) || !safePath(finding.path) || !integer(finding.line)) {
      throw new Error('Invalid structured review finding.');
    }
    const location = `${finding.path}:${finding.line}:${finding.title}`;
    if (seen.has(location)) throw new Error('Duplicate review finding.');
    seen.add(location);
    if (files && !files.some(file => file.path === finding.path && file.lines.includes(finding.line))) {
      throw new Error('Review finding must refer to a new-side line in the supplied patch hunk.');
    }
  }
  return value;
}

function parseReview(text, files) {
  const plain = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, '$1');
  let parsed;
  try { parsed = JSON.parse(plain); } catch { throw new Error('Review did not return valid JSON. No correction is authorized.'); }
  return validateReview(parsed, files);
}

function renderReview(value) {
  validateReview(value);
  return value.summary + '\n\n' + (value.findings.length ? value.findings.map((finding, index) =>
    `### F${index + 1} — ${finding.priority}: ${finding.title}\n\n` +
    `\`${finding.path}:${finding.line}\`\n\n${finding.body}`).join('\n\n') : 'Nenhum achado acionável nesta revisão.');
}

function validateEnvelope(value) {
  if (value?.version !== 1 || !integer(value.pr) || !SHA.test(value.sha || '') ||
      !integer(value.runId) || !integer(value.runAttempt) || !bounded(value.repository, 200) ||
      !Number.isFinite(value.estimatedCostUsd) || value.estimatedCostUsd < 0 || value.estimatedCostUsd > 1 ||
      value.usageComplete !== true || value.policyDecision !== 'allow') throw new Error('Invalid review provenance or usage.');
  validateReview(value.review);
  return value;
}

function encodeEnvelope(value) {
  return `<!-- continuous-ai-review-data:${Buffer.from(JSON.stringify(validateEnvelope(value))).toString('base64')} -->`;
}

function decodeEnvelope(body) {
  const matches = [...(body || '').matchAll(/<!-- continuous-ai-review-data:([A-Za-z0-9+/=]+) -->/g)];
  if (matches.length !== 1 || matches[0][1].length > 40000) throw new Error('Structured review data is missing, duplicated, or oversized.');
  const encoded = matches[0];
  let value;
  try { value = JSON.parse(Buffer.from(encoded[1], 'base64').toString('utf8')); } catch { throw new Error('Invalid review data.'); }
  return validateEnvelope(value);
}

module.exports = { SHA, integer, safePath, changedLines, parseReview, validateReview, renderReview,
  validateEnvelope, encodeEnvelope, decodeEnvelope };
