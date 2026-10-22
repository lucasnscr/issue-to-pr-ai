import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, evaluateResponses, loadDataset } from './review-evaluation.mjs';
import { runReview } from './run-review.mjs';
import { loadPolicy } from './ai-policy.mjs';
import skills from './skills.cjs';

export async function evaluate({ live = false, responsesFile, output = 'artifacts/reviewer-evaluation.json', env = process.env, review = runReview } = {}) {
  const config = JSON.parse(readFileSync(new URL('../config/review-evaluation.json', import.meta.url), 'utf8'));
  const dataset = loadDataset(new URL('../' + config.dataset, import.meta.url));
  const policyText = readFileSync(new URL('../config/ai-policy.json', import.meta.url), 'utf8');
  let commit = 'unavailable';
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
  const provenance = { mode: live ? 'live' : 'supplied', model: live ? env.MODEL : 'supplied-responses', commit,
    policyHash: digest(policyText), evaluationPolicyHash: digest(JSON.stringify(config)), opencodeVersion: live ? config.opencodeVersion : null,
    skills: skills.bundle({ phases: ['review'], commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null }).manifest };
  const responses = [];
  const usages = [];
  let spent = 0;
  if (live) {
    const policy = loadPolicy('review', env.MODEL);
    const credential = env.MODEL?.startsWith('vllm/') ? 'VLLM_API_KEY' : 'ANTHROPIC_API_KEY';
    if (!env[credential]) throw new Error('The configured evaluation provider credential is missing.');
    if (dataset.cases.length > config.maxLiveCases) throw new Error('Dataset exceeds the live case limit.');
    for (const item of dataset.cases) {
      if (spent + policy.maxEstimatedCostUsd > config.maxEstimatedBudgetUsd) break;
      const directory = resolve(dirname(output), 'cases', item.id);
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, 'context.txt'), item.context);
      writeFileSync(resolve(directory, 'metadata.json'), JSON.stringify({ files: item.metadata }));
      try {
        await review({ env: { ...env, REVIEW_DIRECTORY: directory }, outputDirectory: directory });
        const usage = JSON.parse(readFileSync(resolve(directory, 'ai-usage.json'), 'utf8'));
        const cost = usage.usage?.estimatedCostUsd;
        if (usage.outcome !== 'completed' || usage.policy?.decision !== 'allow' || usage.usage?.complete !== true || !Number.isFinite(cost) || cost < 0 || cost > policy.maxEstimatedCostUsd) throw new Error('Incomplete or invalid evaluation usage.');
        const value = JSON.parse(readFileSync(resolve(directory, 'review.json'), 'utf8'));
        spent += cost;
        usages.push({ caseId: item.id, runId: usage.runId, estimatedCostUsd: cost, durationSeconds: usage.durationSeconds });
        responses.push({ caseId: item.id, review: value });
      } catch {
        // Preserve partial metrics/usage; never continue spending after an
        // unknown provider result. Raw provider output is not printed.
        let cost = null;
        const file = resolve(directory, 'ai-usage.json');
        if (existsSync(file)) {
          try {
            const observed = JSON.parse(readFileSync(file, 'utf8')).usage;
            if (observed?.complete === true && Number.isFinite(observed.estimatedCostUsd) && observed.estimatedCostUsd >= 0) {
              cost = observed.estimatedCostUsd; spent += cost;
            }
          } catch { /* Unknown usage remains unavailable. */ }
        }
        usages.push({ caseId: item.id, outcome: 'failed', estimatedCostUsd: cost });
        break;
      }
    }
  } else {
    if (!responsesFile) throw new Error('Use --responses FILE for an offline evaluation, or explicitly --live.');
    const input = JSON.parse(readFileSync(responsesFile, 'utf8'));
    if (input.version !== 1 || input.datasetVersion !== dataset.version) throw new Error('Response dataset version mismatch.');
    provenance.responseHash = digest(JSON.stringify(input));
    responses.push(...input.responses);
  }
  const result = evaluateResponses(dataset, responses, provenance);
  result.usage = { estimatedCostUsd: live && usages.length > 0 && usages.every(u => u.estimatedCostUsd !== null) ? spent : null,
    knownEstimatedCostUsd: live ? spent : null,
    complete: live ? usages.length === dataset.cases.length && usages.every(u => u.outcome !== 'failed') : null, cases: usages };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ mode: provenance.mode, evaluationValid: result.evaluationValid, metrics: result.metrics,
    estimatedCostUsd: result.usage.estimatedCostUsd }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const result = await evaluate({ live: args.includes('--live'), responsesFile: option('--responses'), output: option('--output') });
  if (!result.evaluationValid) process.exitCode = 1;
}
