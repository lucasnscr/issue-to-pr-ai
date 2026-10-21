const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const manifest = path.resolve(__dirname, '../../evals/reviewer/v1/dataset.json');
const input = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../evals/reviewer/v1/example-responses.json')));
const library = () => import('../review-evaluation.mjs');

test('versioned real-defect and clean cases score TP/FP/FN without claiming synthetic results are model quality', async () => {
  const { loadDataset, evaluateResponses } = await library();
  const dataset = loadDataset(manifest);
  assert.equal(dataset.cases.length, 6);
  const result = evaluateResponses(dataset, input.responses, { mode: 'supplied' });
  assert.equal(result.evaluationValid, true);
  assert.deepEqual(result.metrics, { cases: 6, truePositives: 2, falsePositives: 1, falseNegatives: 0,
    precision: 2/3, recall: 1, f1: 4/5, invalidResponses: 0, severityMismatches: 0, cleanCasePassRate: 3/4 });
  assert.match(result.provenance.datasetHash, /^[a-f0-9]{64}$/);
  assert.match(result.provenance.promptHash, /^[a-f0-9]{64}$/);
  for (const item of dataset.cases) assert(!item.context.includes('"expected"'));
});

test('missing clean responses are invalid and missing bug responses also count as missed defects', async () => {
  const { loadDataset, evaluateResponses } = await library();
  const d = loadDataset(manifest);
  for (const id of ['pagination-truncates','optional-description']) {
    const result = evaluateResponses(d, input.responses.filter(r => r.caseId !== id));
    assert.equal(result.evaluationValid, false);
    assert.equal(result.metrics.invalidResponses, 1);
    assert.equal(result.metrics.falseNegatives, id === 'pagination-truncates' ? 1 : 0);
  }
  assert.throws(() => evaluateResponses(d, [...input.responses,input.responses[0]]), /duplicate/);
  assert.throws(() => evaluateResponses(d, [{caseId:'invented',review:{}}]), /Unknown/);
});

test('location alone cannot match a defect, duplicate hypotheses cannot satisfy the same gold twice, severity is separate', async () => {
  const { loadDataset, scoreCase } = await library();
  const item = loadDataset(manifest).cases[0];
  const valid = input.responses[0].review;
  const unrelated = { ...valid, findings: [{ ...valid.findings[0], title:'Hipótese futura', body:'Trocar de provedor no futuro talvez mude o contrato.' }] };
  const score = scoreCase(item, unrelated);
  assert.equal(score.truePositives, 0); assert.equal(score.falsePositives, 1); assert.equal(score.falseNegatives, 1);
  const doubled = scoreCase(item, { ...valid, findings: [valid.findings[0],{...valid.findings[0],title:'Outra descrição do limite'}] });
  assert.equal(doubled.truePositives,1); assert.equal(doubled.falsePositives,1);
  assert.equal(scoreCase(item,{...valid,findings:[{...valid.findings[0],priority:'P0'}]}).severityMismatches,1);
  assert.equal(scoreCase(item,{...valid,findings:[{...valid.findings[0],line:999}]}).valid,false);
});

test('live evaluation uses production reviewer options, records provenance and stops on unknown usage', async () => {
  const { evaluate } = await import('../evaluate-reviews.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'review-eval-'));
  try {
    let calls=0;
    const result=await evaluate({live:true,output:path.join(root,'report.json'),env:{MODEL:'anthropic/claude-sonnet-4-6',ANTHROPIC_API_KEY:'FAKE_TEST_ONLY'},
      review:async ({env,outputDirectory}) => {
        calls++; assert.equal(env.REVIEW_DIRECTORY,outputDirectory);
        fs.writeFileSync(path.join(outputDirectory,'review.json'),JSON.stringify({summary:'Sem defeitos.',findings:[]}));
        // No usage record means inference status/cost is unknown.
      }});
    assert.equal(calls,1); assert.equal(result.evaluationValid,false);
    assert.equal(result.usage.estimatedCostUsd,null); assert.equal(result.usage.complete,false);
    assert.equal(result.provenance.mode,'live'); assert.equal(result.provenance.model,'anthropic/claude-sonnet-4-6');
    assert.match(result.provenance.policyHash,/^[a-f0-9]{64}$/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('live evaluation reserves the next review allowance and keeps a partial report when the budget is exhausted', async () => {
  const { evaluate } = await import('../evaluate-reviews.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-budget-'));
  try {
    let calls=0;
    const result=await evaluate({live:true,output:path.join(root,'report.json'),env:{MODEL:'anthropic/claude-sonnet-4-6',ANTHROPIC_API_KEY:'FAKE_TEST_ONLY'},
      review:async ({outputDirectory}) => {
        calls++;
        fs.writeFileSync(path.join(outputDirectory,'review.json'),JSON.stringify({summary:'Sem defeitos.',findings:[]}));
        fs.writeFileSync(path.join(outputDirectory,'ai-usage.json'),JSON.stringify({outcome:'completed',policy:{decision:'allow'},usage:{complete:true,estimatedCostUsd:0.7}}));
      }});
    assert.equal(calls,2); assert.equal(result.evaluationValid,false);
    assert.equal(result.metrics.invalidResponses,4); assert.equal(result.usage.estimatedCostUsd,1.4);
    assert.equal(result.usage.complete,false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
