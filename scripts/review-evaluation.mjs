import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import report from '../.github/scripts/review-report.cjs';
import { buildReviewPrompt } from './review-prompt.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const fraction = (a, b) => b ? a / b : null;

export function loadDataset(filename) {
  const full = realpathSync(filename), root = dirname(full);
  const manifest = JSON.parse(readFileSync(full, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases) || !manifest.cases.length || manifest.cases.length > 50) throw new Error('Invalid evaluation manifest.');
  const seen = new Set();
  const cases = manifest.cases.map(name => {
    if (typeof name !== 'string' || !/^[a-z0-9/-]+\.json$/.test(name) || name.includes('..')) throw new Error('Invalid case path.');
    const file = realpathSync(resolve(root, name));
    if (!file.startsWith(root + sep)) throw new Error('Case escaped the dataset.');
    const text = readFileSync(file, 'utf8');
    if (Buffer.byteLength(text) > 256000) throw new Error('Case exceeds size limit.');
    const item = JSON.parse(text);
    if (!/^[a-z0-9-]{1,80}$/.test(item.id || '') || seen.has(item.id) || typeof item.base !== 'string' || !Array.isArray(item.files) || !item.files.length || !Array.isArray(item.expected)) throw new Error('Invalid or duplicate evaluation case.');
    seen.add(item.id);
    const files = item.files.map(f => {
      if (!report.safePath(f.path) || typeof f.patch !== 'string' || !f.patch.startsWith('@@')) throw new Error('Invalid case patch.');
      return { path: f.path, lines: report.changedLines(f.patch) };
    });
    for (const expected of item.expected) {
      if (!report.safePath(expected.path) || !Array.isArray(expected.lines) || !expected.lines.length || expected.lines.some(n => !Number.isSafeInteger(n) || n < 1) || !Array.isArray(expected.evidence) || !expected.evidence.length || expected.evidence.some(group => !Array.isArray(group) || !group.length || group.some(term => typeof term !== 'string' || !term.trim())) || !Array.isArray(expected.priorities) || expected.priorities.some(p => !['P0','P1','P2','P3'].includes(p))) throw new Error('Invalid gold label.');
      if (!files.some(f => f.path === expected.path && expected.lines.every(n => f.lines.includes(n)))) throw new Error('Gold location is outside supplied hunks.');
    }
    const context = 'Trusted base excerpts and current API contract:\n' + item.base + '\nPATCH:\n' + item.files.map(f => `FILE: ${f.path}\n${f.patch}`).join('\n\n');
    return { ...item, metadata: files, context, hash: digest(text) };
  });
  return { version: manifest.version, name: manifest.name, cases,
    hash: digest(JSON.stringify({ manifest, hashes: cases.map(c => c.hash) })),
    promptHash: digest(buildReviewPrompt('<evaluation-input>')) };
}

export function scoreCase(item, value) {
  let review;
  try { review = report.validateReview(value, item.metadata); }
  catch { return { id: item.id, valid: false, truePositives: 0, falsePositives: 0, falseNegatives: item.expected.length, severityMismatches: 0, error: 'Missing or invalid structured response.' }; }
  // Maximum bipartite matching prevents one vague finding or its ordering from
  // satisfying multiple gold defects. Location alone is insufficient evidence.
  const edges = review.findings.map(finding => item.expected.flatMap((gold, index) => {
    const evidence = normalized(finding.title + ' ' + finding.body);
    return gold.path === finding.path && gold.lines.includes(finding.line) && gold.evidence.every(group => group.some(term => evidence.includes(normalized(term)))) ? [index] : [];
  }));
  const assigned = new Map();
  const match = (index, visited) => edges[index].some(gold => {
    if (visited.has(gold)) return false;
    visited.add(gold);
    if (!assigned.has(gold) || match(assigned.get(gold), visited)) { assigned.set(gold, index); return true; }
    return false;
  });
  edges.forEach((_, index) => match(index, new Set()));
  const truePositives = assigned.size;
  const severityMismatches = [...assigned].filter(([gold, actual]) => !item.expected[gold].priorities.includes(review.findings[actual].priority)).length;
  return { id: item.id, valid: true, truePositives, falsePositives: review.findings.length - truePositives,
    falseNegatives: item.expected.length - truePositives, severityMismatches,
    clean: item.expected.length === 0, cleanPassed: item.expected.length === 0 && review.findings.length === 0 };
}

export function evaluateResponses(dataset, responses, provenance = {}) {
  if (!Array.isArray(responses)) throw new Error('Responses must be an array.');
  const ids = new Set();
  for (const response of responses) {
    if (!dataset.cases.some(c => c.id === response.caseId) || ids.has(response.caseId)) throw new Error('Unknown or duplicate response case.');
    ids.add(response.caseId);
  }
  const cases = dataset.cases.map(item => scoreCase(item, responses.find(r => r.caseId === item.id)?.review));
  const sum = key => cases.reduce((n, c) => n + (c[key] || 0), 0);
  const tp = sum('truePositives'), fp = sum('falsePositives'), fn = sum('falseNegatives');
  const invalidResponses = cases.filter(c => !c.valid).length;
  return { version: 1, generatedAt: new Date().toISOString(),
    provenance: { ...provenance, datasetVersion: dataset.version, datasetHash: dataset.hash, promptHash: dataset.promptHash },
    evaluationValid: invalidResponses === 0,
    metrics: { cases: cases.length, truePositives: tp, falsePositives: fp, falseNegatives: fn,
      precision: fraction(tp, tp + fp), recall: fraction(tp, tp + fn), f1: fraction(2 * tp, 2 * tp + fp + fn),
      invalidResponses, severityMismatches: sum('severityMismatches'),
      cleanCasePassRate: fraction(cases.filter(c => c.cleanPassed).length, dataset.cases.filter(c => !c.expected.length).length) }, cases };
}
