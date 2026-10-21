import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReviewPrompt } from './review-prompt.mjs';
import { runGovernedOpenCode } from './run-governed-opencode.mjs';
import { interpretLiveResult } from './run-live-test.mjs';
import reviewLimits from '../.github/scripts/review-limits.cjs';
import report from '../.github/scripts/review-report.cjs';

export async function runReview({ env = process.env, run = runGovernedOpenCode, outputDirectory = 'artifacts' } = {}) {
  const model = env.MODEL;
  const directory = env.REVIEW_DIRECTORY;
  if (!model || !directory) throw new Error('MODEL and REVIEW_DIRECTORY are required.');
  const patch = readFileSync(join(directory, 'context.txt'), 'utf8');
  if (!patch.trim() || Buffer.byteLength(patch) > reviewLimits.maxContextBytes) throw new Error('Review context is empty or exceeds its limit.');
  // Supply bounded plain text without attachment preprocessing. The reviewer
  // keeps every tool denied, and the wrapper preserves sanitized API diagnostics.
  const result = await run([
    'run',
    buildReviewPrompt(patch),
    '--model', model, '--agent', 'reviewer', '--format', 'json',
  ], { profile: 'review', model, env, usageFile: join(outputDirectory, 'ai-usage.json') });
  const credential = model.startsWith('vllm/') ? env.VLLM_API_KEY : env.ANTHROPIC_API_KEY;
  const raw = interpretLiveResult(result, credential);
  const metadataFile = join(directory, 'metadata.json');
  const files = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')).files : undefined;
  const structured = report.parseReview(raw, files);
  const review = report.renderReview(structured);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'review.md'), review + '\n');
  writeFileSync(join(outputDirectory, 'review.json'), JSON.stringify(structured, null, 2) + '\n');
  console.log('Review generated. Publication is handled by a separate step.');
  return review;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await runReview();
