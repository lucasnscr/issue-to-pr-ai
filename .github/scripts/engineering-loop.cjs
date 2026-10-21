const fs = require('node:fs');
const path = require('node:path');
const { SHA, integer, safePath, decodeEnvelope } = require('./review-report.cjs');
const limits = require('../../config/engineering-loop.json');
const skills = require('../../scripts/skills.cjs');

const STATE_MARKER = '<!-- continuous-ai-engineering-state:v1 -->';
const BOT = 'github-actions[bot]';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hasLabel = (pr, name) => pr.labels?.some(label => label.name === name);
const allowedPath = file => safePath(file) && (/^apps\/catalog-api\/src\/(main|test)\//.test(file) ||
  file === 'README.md' || /^docs\/.+\.md$/.test(file));

function validateState(state, number) {
  if (state?.version !== 1 || state.pr !== number || !Array.isArray(state.attempts) ||
      state.attempts.length > limits.maxAttempts || !Array.isArray(state.reviews) || state.reviews.length > 20 ||
      !['active', 'awaiting-review', 'ready-for-human', 'needs-human'].includes(state.status)) throw new Error('Invalid loop state.');
  const seen = new Set();
  const runs = new Set();
  state.attempts.forEach((attempt, index) => {
    if (attempt.number !== index + 1 || !SHA.test(attempt.sha || '') || !integer(attempt.runId) ||
        !integer(attempt.reviewRunId) || seen.has(attempt.sha) || runs.has(attempt.runId) ||
        !['reserved', 'published', 'failed'].includes(attempt.status) ||
        (attempt.newSha && !SHA.test(attempt.newSha)) || (attempt.status === 'published' && !attempt.newSha) ||
        (attempt.estimatedCostUsd !== undefined && (!Number.isFinite(attempt.estimatedCostUsd) ||
          attempt.estimatedCostUsd < 0 || attempt.estimatedCostUsd > limits.maxCorrectionEstimatedUsd))) throw new Error('Invalid correction reservation.');
    seen.add(attempt.sha);
    runs.add(attempt.runId);
  });
  for (const review of state.reviews) {
    if (!integer(review.runId) || !SHA.test(review.sha || '') || !Number.isFinite(review.estimatedCostUsd) ||
        review.estimatedCostUsd < 0 || review.estimatedCostUsd > limits.maxReviewEstimatedUsd) throw new Error('Invalid review accounting.');
  }
  return state;
}

function readState(comments, number) {
  const matches = comments.filter(comment => comment.user?.login === BOT && comment.body?.startsWith(STATE_MARKER));
  if (matches.length > 1) throw new Error('Multiple loop states require maintainer intervention.');
  if (!matches.length) return { state: { version: 1, pr: number, status: 'active', reason: '', attempts: [], reviews: [] }, id: null };
  const encoded = matches[0].body.match(/<!-- continuous-ai-engineering-data:([A-Za-z0-9+/=]+) -->/);
  if (!encoded || encoded[1].length > 20000) throw new Error('Loop state is missing or oversized.');
  return { state: validateState(JSON.parse(Buffer.from(encoded[1], 'base64').toString('utf8')), number), id: matches[0].id };
}

function reservedBudget(state) {
  // Keep the full reservation even if a failed/cancelled invocation reports no usage.
  // Each reservation includes the following review, so reruns cannot recover its allowance.
  const firstReview = limits.maxReviewEstimatedUsd;
  const corrections = state.attempts.length * (limits.maxCorrectionEstimatedUsd + limits.maxReviewEstimatedUsd);
  const knownReviews = new Set(state.attempts.map(attempt => attempt.newSha).filter(Boolean));
  const extraReviews = state.reviews.filter((review, index) => index > 0 && !knownReviews.has(review.sha))
    .reduce((total, review) => total + review.estimatedCostUsd, 0);
  return firstReview + corrections + extraReviews;
}

function renderState(state) {
  const titles = { active: 'Ciclo iniciado', 'awaiting-review': 'Aguardando CI e nova revisão',
    'ready-for-human': 'Pronta para avaliação do mantenedor', 'needs-human': 'Intervenção necessária' };
  const rows = state.attempts.map(attempt => `| ${attempt.number} | \`${attempt.sha.slice(0, 12)}\` | ${attempt.status} | ${attempt.runId} |`).join('\n');
  const observed = state.reviews.reduce((total, review) => total + review.estimatedCostUsd, 0) +
    state.attempts.reduce((total, attempt) => total + (attempt.estimatedCostUsd ?? 0), 0);
  return `${STATE_MARKER}\n## Engineering loop: ${titles[state.status]}\n\n${state.reason}\n\n` +
    `Tentativas reservadas: **${state.attempts.length}/${limits.maxAttempts}**. ` +
    `Orçamento estimado reservado: **USD ${reservedBudget(state).toFixed(2)}/${limits.maxEstimatedBudgetUsd.toFixed(2)}**. ` +
    `Consumo estimado reportado: USD ${observed.toFixed(4)}; ausência de telemetria não libera a reserva.\n\n` +
    (rows ? `| Tentativa | SHA analisado | Estado | Execução de correção |\n|---|---|---|---|\n${rows}\n\n` : '') +
    'A PR continua em avaliação humana. Este ciclo não aprova nem faz merge.\n\n' +
    `<!-- continuous-ai-engineering-data:${Buffer.from(JSON.stringify(state)).toString('base64')} -->`;
}

async function saveState(github, repo, record) {
  validateState(record.state, record.state.pr);
  const body = renderState(record.state);
  if (record.id) await github.rest.issues.updateComment({ ...repo, comment_id: record.id, body });
  else {
    const { data } = await github.rest.issues.createComment({ ...repo, issue_number: record.state.pr, body });
    record.id = data.id;
  }
}

function assertPr(pr, repo, defaultBranch) {
  if (pr.state !== 'open' || pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}` ||
      pr.base.ref !== defaultBranch || pr.head.ref === defaultBranch ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,150}$/.test(pr.head.ref || '') ||
      !SHA.test(pr.head.sha || '') || !SHA.test(pr.base.sha || '') || !hasLabel(pr, 'ai:autofix')) {
    throw new Error('Correction requires an open same-repository PR targeting the default branch with ai:autofix.');
  }
}

function assertScope(pr, files) {
  if (!files.length || files.length !== pr.changed_files || files.length > limits.maxChangedFiles ||
      files.some(file => !allowedPath(file.filename) || (file.previous_filename && !allowedPath(file.previous_filename)) ||
        !file.patch || !['added', 'modified', 'removed', 'renamed'].includes(file.status))) {
    throw new Error('PR exceeds the application/test/Markdown scope or contains an incomplete/binary patch.');
  }
}

async function verifiedRun({ github, repo, runId, defaultBranch, pause = sleep }) {
  for (let count = 0; count < 19; count++) {
    const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
    if (run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/ai-review.yml' ||
        run.head_branch !== defaultBranch || run.head_repository?.full_name !== `${repo.owner}/${repo.repo}` ||
        !SHA.test(run.head_sha || '')) throw new Error('Only reviews dispatched from the trusted default branch may authorize corrections.');
    if (run.status === 'completed') return run;
    if (count < 18) await pause(5000);
  }
  throw new Error('Source review completion timed out.');
}

async function waitForCi({ github, repo, sha, pause = sleep, waitSeconds = limits.ciWaitSeconds }) {
  for (let elapsed = 0; elapsed <= waitSeconds; elapsed += 15) {
    const { data } = await github.rest.actions.listWorkflowRuns({ ...repo, workflow_id: 'ci.yml', head_sha: sha, per_page: 30 });
    const runs = data.workflow_runs.filter(run => run.head_sha === sha &&
      run.head_repository?.full_name === `${repo.owner}/${repo.repo}` && ['pull_request', 'workflow_dispatch'].includes(run.event));
    // The publisher explicitly dispatches CI because bot-created PR events can
    // wait for workflow approval. A queued PR event must not shadow that run.
    const dispatched = runs.filter(run => run.event === 'workflow_dispatch');
    const latest = (dispatched.length ? dispatched : runs).sort((left, right) => right.id - left.id)[0];
    if (latest?.status === 'completed') return latest.conclusion === 'success' ? 'success' : 'failed';
    if (elapsed < waitSeconds) await pause(15000);
  }
  return 'timeout';
}

async function currentPr({ github, repo, plan, defaultBranch }) {
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: plan.pr });
  assertPr(pr, repo, defaultBranch);
  const { data: base } = await github.rest.repos.getCommit({ ...repo, ref: defaultBranch });
  if (pr.head.sha !== plan.sha || pr.base.sha !== plan.baseSha || base.sha !== plan.baseSha || pr.head.ref !== plan.branch) {
    throw new Error('PR head, branch, or base changed. Refusing an obsolete correction.');
  }
  return pr;
}

async function prepare({ github, context, core, pause = sleep, directory = process.env.RUNNER_TEMP }) {
  core.setOutput('ready', 'false');
  const repo = context.repo;
  const number = Number(context.payload.inputs?.pull_request);
  const runId = Number(context.payload.inputs?.review_run_id);
  const expectedSha = context.payload.inputs?.head_sha;
  const defaultBranch = context.payload.repository.default_branch;
  if (!integer(number) || !integer(runId) || !SHA.test(expectedSha || '')) throw new Error('Valid PR, SHA, and review run numbers are required.');
  if (context.actor !== BOT) {
    const { data: access } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: context.actor });
    if (!['admin', 'maintain', 'write'].includes(access.permission)) throw new Error('Write access is required.');
  }
  const run = await verifiedRun({ github, repo, runId, defaultBranch, pause });
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  assertPr(pr, repo, defaultBranch);
  if (expectedSha !== pr.head.sha) { core.notice('Ignored: the reviewed SHA is no longer current.'); return; }
  const comments = await github.paginate(github.rest.issues.listComments, { ...repo, issue_number: number, per_page: 100 });
  const reports = comments.filter(comment => comment.user?.login === BOT).flatMap(comment => {
    try { return [decodeEnvelope(comment.body)]; } catch { return []; }
  }).filter(value => value.runId === runId && value.runAttempt === run.run_attempt && value.pr === number &&
    value.repository === `${repo.owner}/${repo.repo}`);
  const record = readState(comments, number);
  const state = record.state;
  if (state.attempts.some(attempt => attempt.sha === expectedSha || attempt.runId === context.runId)) {
    core.notice('This SHA already consumed a correction reservation; reruns cannot spend again.'); return;
  }
  const stop = async reason => {
    state.status = 'needs-human'; state.reason = reason;
    await saveState(github, repo, record);
    core.notice(reason);
  };
  try {
    if (run.conclusion !== 'success') throw new Error('The source AI review failed. Inspect its diagnostics before continuing.');
    if (reports.length !== 1 || reports[0].sha !== expectedSha) throw new Error('A unique structured bot review for this execution and SHA is required.');
    const report = reports[0];
    if (!state.reviews.some(review => review.runId === runId)) state.reviews.push({
      runId, sha: report.sha, estimatedCostUsd: report.estimatedCostUsd });
    if (context.sha !== pr.base.sha) throw new Error('The default branch moved since this correction workflow started.');
    const files = await github.paginate(github.rest.pulls.listFiles, { ...repo, pull_number: number, per_page: 100 });
    assertScope(pr, files);
    const { data: comparison } = await github.rest.repos.compareCommits({ ...repo, base: pr.base.sha, head: pr.head.sha });
    if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('Update the PR branch from the current default branch before correction.');
    const ci = await waitForCi({ github, repo, sha: pr.head.sha, pause });
    if (ci !== 'success') throw new Error(`CI for the reviewed SHA ${ci === 'failed' ? 'failed' : 'did not finish within the wait limit'}.`);
    const plan = { version: 1, pr: number, sha: pr.head.sha, baseSha: pr.base.sha, branch: pr.head.ref,
      reviewRunId: runId, runId: context.runId, review: report.review };
    await currentPr({ github, repo, plan, defaultBranch });
    if (!report.review.findings.length) {
      state.status = 'ready-for-human'; state.reason = `CI passou e a revisão do SHA \`${report.sha}\` não apontou defeitos. O mantenedor decide o merge.`;
      await saveState(github, repo, record);
      return;
    }
    if (state.status === 'needs-human') throw new Error('The cycle already stopped. A maintainer must evaluate the PR.');
    if (report.review.findings.some(finding => finding.priority === 'P0')) throw new Error('A critical P0 finding requires maintainer intervention.');
    if (state.attempts.length >= limits.maxAttempts || reservedBudget(state) +
        limits.maxCorrectionEstimatedUsd + limits.maxReviewEstimatedUsd > limits.maxEstimatedBudgetUsd) {
      throw new Error('The correction attempt or estimated budget limit was reached.');
    }
    if ((pr.body || '').length > 20000) throw new Error('PR acceptance context exceeds its limit.');
    plan.prDescription = pr.body || '';
    const linked = plan.prDescription.match(/(?:closes|fixes|resolves)\s+#([1-9]\d*)\b/i);
    if (linked) {
      const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: Number(linked[1]) });
      if (issue.pull_request || !issue.body || issue.body.length > 20000) throw new Error('The linked issue acceptance criteria are missing or oversized.');
      plan.issue = { number: issue.number, title: issue.title, body: issue.body };
    }
    const selected = await skills.selectionForPr({ github, repo, pr });
    plan.skills = skills.bundle({ selection: selected, phases: ['correction', 'testing'], commit: pr.base.sha }).manifest;
    // Persist before exposing a model credential. A cancelled job still consumes this attempt.
    plan.attempt = state.attempts.length + 1;
    state.attempts.push({ number: plan.attempt, sha: plan.sha, reviewRunId: runId,
      runId: context.runId, status: 'reserved' });
    state.status = 'active'; state.reason = `Tentativa ${plan.attempt} reservada para tratar ${report.review.findings.length} achado(s).`;
    await saveState(github, repo, record);
    plan.stateCommentId = record.id;
    const taskDirectory = path.join(directory, 'correction-plan');
    fs.mkdirSync(taskDirectory, { recursive: true });
    fs.writeFileSync(path.join(taskDirectory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
    fs.writeFileSync(path.join(taskDirectory, 'skills-manifest.json'), JSON.stringify(plan.skills, null, 2) + '\n');
    for (const [key, value] of Object.entries({ ready: 'true', number, sha: plan.sha, base_sha: plan.baseSha,
      branch: plan.branch, attempt: plan.attempt, state_comment_id: record.id, directory: taskDirectory })) core.setOutput(key, String(value));
  } catch (error) {
    await stop(error.message);
  }
}

async function dispatch({ github, context, core }) {
  const number = Number(context.payload.inputs?.pull_request);
  const sha = process.env.REVIEW_SHA;
  const sourceRunId = Number(process.env.REVIEW_RUN_ID || context.runId);
  if (!integer(number) || !integer(sourceRunId) || !SHA.test(sha || '')) return;
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  if (pr.state !== 'open' || pr.head.sha !== sha || !hasLabel(pr, 'ai:autofix')) return;
  await github.rest.actions.createWorkflowDispatch({ ...context.repo, workflow_id: 'ai-correct.yml',
    ref: context.payload.repository.default_branch, inputs: {
      pull_request: String(number), review_run_id: String(sourceRunId), head_sha: sha,
    } });
  core.notice('Bounded correction cycle dispatched. Merge remains a maintainer decision.');
}

async function finish({ github, context, core, env = process.env }) {
  const number = Number(env.PR_NUMBER);
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: number, per_page: 100 });
  const record = readState(comments, number);
  const attempt = record.state.attempts.find(value => value.runId === context.runId);
  if (!attempt) throw new Error('Correction reservation not found.');
  const success = env.PUBLISH_OUTCOME === 'success' && SHA.test(env.PUBLISHED_SHA || '');
  attempt.status = success ? 'published' : 'failed';
  if (SHA.test(env.PUBLISHED_SHA || '')) attempt.newSha = env.PUBLISHED_SHA;
  const cost = Number(env.ESTIMATED_COST_USD);
  if (env.ESTIMATED_COST_USD && Number.isFinite(cost) && cost >= 0 && cost <= limits.maxCorrectionEstimatedUsd) attempt.estimatedCostUsd = cost;
  record.state.status = success ? 'awaiting-review' : 'needs-human';
  record.state.reason = success ? `Correção publicada em \`${attempt.newSha}\`. CI e revisão foram disparadas novamente.` :
    attempt.newSha ? `Commit \`${attempt.newSha}\` publicado, mas o disparo da CI ou revisão falhou. A tentativa permanece consumida; intervenha manualmente.` :
      'A correção, os testes ou a publicação não concluíram. A tentativa permanece consumida; confira a execução e intervenha manualmente.';
  await saveState(github, context.repo, record);
  core.notice(record.state.reason);
}

module.exports = { limits, allowedPath, validateState, readState, reservedBudget, renderState,
  assertPr, assertScope, verifiedRun, waitForCi, currentPr, prepare, dispatch, finish };
