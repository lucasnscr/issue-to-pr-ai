import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGovernedOpenCode } from './run-governed-opencode.mjs';
import { interpretLiveResult } from './run-live-test.mjs';
import { loadPolicy, assertUsageAllowed } from './ai-policy.mjs';
import specification from '../.github/scripts/specification.cjs';
import skills from './skills.cjs';

export function specificationEnvironment(env) {
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TMPDIR', 'TEMP', 'LANG', 'LC_ALL',
    'ANTHROPIC_API_KEY', 'VLLM_BASE_URL', 'VLLM_API_KEY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'];
  return Object.fromEntries(allowed.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}

export async function runSpecification({ env = process.env, run = runGovernedOpenCode, outputDirectory = 'artifacts' } = {}) {
  const { MODEL: model, SPEC_DIRECTORY: directory } = env;
  if (!model || !directory) throw new Error('MODEL and SPEC_DIRECTORY are required.');
  const policy = loadPolicy('specification', model);
  const metadata = JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8'));
  const skillBundle = skills.bundle({ selection: metadata.skills.selected, phases: ['specification'], commit: metadata.skills.catalogCommit });
  if (metadata.skills.contextHash !== skillBundle.manifest.contextHash || metadata.skills.catalogHash !== skillBundle.manifest.catalogHash) throw new Error('Specification skill integrity changed.');
  const input = readFileSync(join(directory, 'input.json'), 'utf8');
  const graphFile = join(directory, 'graph-context.json');
  const graph = existsSync(graphFile) ? skills.validateGraph(JSON.parse(readFileSync(graphFile, 'utf8')), skillBundle.manifest.catalogCommit) : null;
  if (skillBundle.graphify && !graph) throw new Error('Selected Graphify context has not been prepared.');
  const prompt = `Refine the supplied issue and current human request as a specification assistant. Do not implement code, call tools, change labels, authorize implementation, or invent user decisions.\n` +
    `Use Portuguese. Ask at most five independent frontier questions. Give a recommendation and explain the effect of each decision. If decisions are missing, status is needs-input; proposed criteria must remain conditional. If the supplied decisions suffice, status is draft-ready; this is still only a human-reviewable proposal.\n` +
    `Return only one JSON object: {"summary":"...","status":"needs-input|draft-ready","questions":[{"id":"Q1","question":"...","recommendation":"...","effect":"..."}],"proposedAcceptanceCriteria":["..."]}. Max summary 1200 characters, 5 questions, 10 criteria; each question/recommendation/criterion <=600, effect <=400.\n\n` +
    `<approved_skills>\n${skillBundle.context}\n</approved_skills>\n\n` +
    (graph ? `<base_graph_context>\n${JSON.stringify(graph)}\n</base_graph_context>\n\n` : '') +
    `<untrusted_issue_and_request>\n${input}\n</untrusted_issue_and_request>`;
  if (Buffer.byteLength(prompt) > 64000) throw new Error('Specification context exceeds its byte limit.');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'skills-manifest.json'), JSON.stringify(skillBundle.manifest, null, 2));
  if (graph) writeFileSync(join(outputDirectory, 'graph-context.json'), JSON.stringify(graph, null, 2));
  const execution = await run(['run', prompt, '--model', model, '--agent', 'specifier', '--format', 'json'],
    { profile: 'specification', model, env: specificationEnvironment(env), usageFile: join(outputDirectory, 'ai-usage.json') });
  // The production wrapper enforces this too. Keep the contract explicit at
  // the new publishing boundary; a mock CLI without telemetry cannot pass.
  if (execution.usage?.outcome !== 'completed' || execution.usage.profile !== 'specification' || execution.usage.policy?.decision !== 'allow') throw new Error('Specification usage is unavailable or blocked.');
  assertUsageAllowed(policy, execution.usage.usage);
  const credential = model.startsWith('vllm/') ? env.VLLM_API_KEY : env.ANTHROPIC_API_KEY;
  const raw = interpretLiveResult(execution, credential);
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); }
  catch { throw new Error('Specification did not return a JSON object.'); }
  const result = specification.validateResult(parsed);
  writeFileSync(join(outputDirectory, 'specification.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(outputDirectory, 'specification.md'), specification.render(result, skillBundle.manifest) + '\n');
  console.log('Specification proposal generated; the publisher will re-authorize the current issue and request.');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runSpecification();
