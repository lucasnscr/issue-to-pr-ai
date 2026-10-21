const { test } = require('node:test');
const assert = require('node:assert/strict');
const report = require('../../.github/scripts/review-report.cjs');
const finding = { priority: 'P2', title: 'Preço incorreto', body: 'O valor perde os centavos.', path: 'app.java', line: 12 };

test('structured review validates hunk evidence including deletion context and accepts an explicit empty result', () => {
  const patch = '@@ -9,3 +9,4 @@\n context\n-removed\n+replacement\n context\n+added';
  assert.deepEqual(report.changedLines(patch), [9, 10, 11, 12]);
  const value = { summary: 'Dois trechos analisados.', findings: [finding] };
  assert.deepEqual(report.parseReview(JSON.stringify(value), [{ path: 'app.java', lines: [10, 12] }]), value);
  assert.deepEqual(report.parseReview('```json\n{"summary":"Sem defeitos.","findings":[]}\n```').findings, []);
  assert.match(report.renderReview(value), /app.java:12/);
});

test('free text, invented locations, duplicate findings and malformed severity do not authorize correction', () => {
  const value = { summary: 'Achado.', findings: [finding] };
  assert.throws(() => report.parseReview('Tudo certo!'), /valid JSON/);
  assert.throws(() => report.parseReview(JSON.stringify(value), [{ path: 'other.java', lines: [12] }]), /patch hunk/);
  for (const change of [{ priority: 'critical' }, { line: 0 }, { path: '../.env' }, { body: 'x'.repeat(1501) }, { command: 'run this' }]) {
    assert.throws(() => report.validateReview({ ...value, findings: [{ ...finding, ...change }] }));
  }
  assert.throws(() => report.validateReview({ ...value, findings: [finding, finding] }), /Duplicate/);
  assert.throws(() => report.validateReview({ ...value, approved: true }));
});

test('review provenance round-trips with usage and rejects missing or over-budget telemetry', () => {
  const value = { version: 1, pr: 3, sha: 'a'.repeat(40), repository: 'example/catalog', runId: 100,
    runAttempt: 1, estimatedCostUsd: 0.12, usageComplete: true, policyDecision: 'allow',
    review: { summary: 'Sem defeitos.', findings: [] } };
  assert.deepEqual(report.decodeEnvelope(report.encodeEnvelope(value)), value);
  for (const change of [{ sha: 'short' }, { usageComplete: false }, { estimatedCostUsd: null },
    { estimatedCostUsd: 1.1 }, { runId: -1 }, { policyDecision: 'block' }]) {
    assert.throws(() => report.encodeEnvelope({ ...value, ...change }));
  }
  assert.throws(() => report.decodeEnvelope('unstructured comment'));
  assert.throws(() => report.decodeEnvelope(report.encodeEnvelope(value) + '\n' + report.encodeEnvelope(value)), /duplicated/);
});
