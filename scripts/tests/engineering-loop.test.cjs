const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loop = require('../../.github/scripts/engineering-loop.cjs');
const { encodeEnvelope } = require('../../.github/scripts/review-report.cjs');
const head = 'a'.repeat(40), base = 'b'.repeat(40), second = 'c'.repeat(40), third = 'd'.repeat(40);
const finding = { priority: 'P2', title: 'Erro reproduzível', body: 'Este ramo devolve um preço inválido.',
  path: 'apps/catalog-api/src/main/java/Product.java', line: 2 };

async function scenario(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-loop-'));
  const context = { repo: { owner: 'example', repo: 'catalog' }, actor: 'github-actions[bot]', runId: 200, sha: base,
    payload: { repository: { default_branch: 'main' }, inputs: { pull_request: '3', review_run_id: '100', head_sha: head } } };
  const pr = { number: 3, state: 'open', draft: true, changed_files: 1,
    head: { sha: head, ref: 'ai/issue-1', repo: { full_name: 'example/catalog' } },
    base: { sha: base, ref: 'main' }, labels: [{ name: 'ai:autofix' }] };
  const source = { id: 100, run_attempt: 1, event: 'workflow_dispatch', path: '.github/workflows/ai-review.yml',
    head_branch: 'main', head_sha: base, head_repository: { full_name: 'example/catalog' }, status: 'completed', conclusion: 'success' };
  const ci = { id: 99, head_sha: head, head_repository: { full_name: 'example/catalog' },
    event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const comments = [], outputs = {}, calls = [], notices = [];
  const files = [{ filename: finding.path, status: 'modified', patch: '@@ -1 +1 @@\n-old\n+new' }];
  const api = { rest: {
    repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }),
      getCommit: async () => ({ data: { sha: base } }), compareCommits: async () => ({ data: { status: 'ahead' } }) },
    pulls: { get: async () => ({ data: structuredClone(pr) }), listFiles() {} },
    actions: { getWorkflowRun: async () => ({ data: source }),
      listWorkflowRuns: async () => ({ data: { workflow_runs: [ci] } }),
      createWorkflowDispatch: async value => { calls.push(value); } },
    issues: { listComments() {},
      createComment: async value => {
        const data = { id: 500 + comments.length, user: { login: 'github-actions[bot]' }, body: value.body };
        comments.push(data); calls.push({ action: 'create-state' }); return { data };
      },
      updateComment: async value => {
        comments.find(comment => comment.id === value.comment_id).body = value.body;
        calls.push({ action: 'update-state' });
      } },
  }, paginate: async method => method === api.rest.issues.listComments ? comments : files };
  const core = { setOutput: (key, value) => { outputs[key] = value; }, notice: value => notices.push(value) };
  const review = (sha = pr.head.sha, runId = source.id, findings = [finding]) => {
    comments.push({ id: 1000 + comments.length, user: { login: 'github-actions[bot]' }, body: encodeEnvelope({
      version: 1, repository: 'example/catalog', pr: 3, sha, runId, runAttempt: 1,
      estimatedCostUsd: 0.1, usageComplete: true, policyDecision: 'allow', review: { summary: 'Revisão.', findings },
    }) });
    context.payload.inputs = { pull_request: '3', review_run_id: String(runId), head_sha: sha };
    source.id = runId; ci.head_sha = sha;
  };
  const prepare = () => loop.prepare({ github: api, context, core, directory, pause: async () => {} });
  const state = () => loop.readState(comments, 3).state;
  const finish = (sha, outcome = 'success', cost = '0.2') => loop.finish({ github: api, context, core,
    env: { PR_NUMBER: '3', PUBLISH_OUTCOME: outcome, PUBLISHED_SHA: sha, ESTIMATED_COST_USD: cost } });
  review();
  try { await callback({ context, pr, source, ci, comments, files, outputs, calls, notices, api, core,
    directory, review, prepare, state, finish }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('review → reserved correction → same-PR publication → clear review closes the loop without merging', () => scenario(async s => {
  await s.prepare();
  assert.equal(s.outputs.ready, 'true');
  assert.equal(s.state().attempts[0].status, 'reserved');
  const plan = JSON.parse(fs.readFileSync(path.join(s.outputs.directory, 'plan.json')));
  assert.equal(plan.sha, head); assert.equal(plan.branch, 'ai/issue-1');
  assert.equal(loop.reservedBudget(s.state()), 5);
  await s.finish(second);
  s.pr.head.sha = second; s.context.runId = 201; s.review(second, 101, []);
  await s.prepare();
  assert.equal(s.outputs.ready, 'false');
  assert.equal(s.state().status, 'ready-for-human');
  assert.equal(s.state().attempts.length, 1);
  assert.equal(s.pr.draft, true);
  assert(s.calls.every(call => ['create-state', 'update-state'].includes(call.action)));
}));

test('persistent findings stop after two corrections and preserve the full estimated reservation', () => scenario(async s => {
  await s.prepare(); await s.finish(second);
  s.pr.head.sha = second; s.context.runId = 201; s.review(second, 101);
  await s.prepare(); assert.equal(s.outputs.attempt, '2'); await s.finish(third);
  s.pr.head.sha = third; s.context.runId = 202; s.review(third, 102);
  await s.prepare();
  assert.equal(s.outputs.ready, 'false');
  assert.equal(s.state().status, 'needs-human');
  assert.match(s.state().reason, /limit/);
  assert.equal(s.state().attempts.length, 2);
  assert.equal(loop.reservedBudget(s.state()), 9);
}));

test('reruns and unknown failed usage cannot release a reservation or spend twice on the same SHA', () => scenario(async s => {
  await s.prepare(); await s.finish('', 'failure', '');
  s.context.runId = 201;
  await s.prepare();
  assert.equal(s.outputs.ready, 'false');
  assert.equal(s.state().attempts.length, 1);
  assert.equal(s.state().status, 'needs-human');
  assert.equal(loop.reservedBudget(s.state()), 5);
  assert.equal(s.state().attempts[0].estimatedCostUsd, undefined);
}));

test('failed CI blocks correction before any model reservation', () => scenario(async s => {
  s.ci.conclusion = 'failure';
  await s.prepare();
  assert.equal(s.outputs.ready, 'false');
  assert.equal(s.state().status, 'needs-human');
  assert.equal(s.state().attempts.length, 0);
  assert.match(s.state().reason, /CI/);
}));

test('a failed provider/review run records intervention instead of leaving the PR awaiting review', () => scenario(async s => {
  s.source.conclusion = 'failure';
  await s.prepare();
  assert.equal(s.state().status, 'needs-human');
  assert.equal(s.state().attempts.length, 0);
  assert.match(s.state().reason, /source AI review failed/);
}));

test('original issue acceptance criteria are read before exposing a model credential', () => scenario(async s => {
  s.pr.body = 'Closes #21';
  let read = false;
  s.api.rest.issues.get = async ({ issue_number }) => {
    read = true; assert.equal(issue_number, 21);
    return { data: { number: 21, title: 'Frontend', body: 'Preservar o contrato e mostrar preço.' } };
  };
  await s.prepare();
  assert(read);
  const plan = JSON.parse(fs.readFileSync(path.join(s.outputs.directory, 'plan.json')));
  assert.equal(plan.issue.number, 21); assert.match(plan.issue.body, /contrato/);
}));

test('a partial publication records its commit and requires intervention when dispatch fails', () => scenario(async s => {
  await s.prepare(); await s.finish(second, 'failure');
  assert.equal(s.state().status, 'needs-human');
  assert.equal(s.state().attempts[0].newSha, second);
  assert.match(s.state().reason, /disparo da CI ou revisão falhou/);
}));

test('CI wait follows the latest matching execution and never substitutes success from another SHA', async () => {
  let calls = 0, waits = 0;
  const run = { id: 2, head_sha: head, head_repository: { full_name: 'example/catalog' }, event: 'workflow_dispatch' };
  const github = { rest: { actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: [
    { ...run, id: 1, status: 'completed', conclusion: 'success' },
    { ...run, status: ++calls === 1 ? 'in_progress' : 'completed', conclusion: 'success' },
    { ...run, id: 3, head_sha: second, status: 'completed', conclusion: 'success' },
    { ...run, id: 4, event: 'pull_request', status: 'waiting', conclusion: null },
  ] } }) } } };
  const args = { github, repo: { owner: 'example', repo: 'catalog' }, sha: head, waitSeconds: 15,
    pause: async () => { waits++; } };
  assert.equal(await loop.waitForCi(args), 'success'); assert.equal(waits, 1);
  github.rest.actions.listWorkflowRuns = async () => ({ data: { workflow_runs: [] } });
  assert.equal(await loop.waitForCi({ ...args, waitSeconds: 0 }), 'timeout');
});

test('forks, untrusted review branches and workflow identities cannot authorize privileged correction', () => scenario(async s => {
  for (const change of [{ head_branch: 'feature' }, { path: '.github/workflows/ci.yml' }, { event: 'pull_request' },
    { head_repository: { full_name: 'fork/catalog' } }]) {
    const original = structuredClone(s.source); Object.assign(s.source, change);
    await assert.rejects(s.prepare(), /trusted default branch/);
    Object.assign(s.source, original);
  }
  assert.equal(s.calls.length, 0);
}));

test('manual correction dispatch requires collaborator write permission', () => scenario(async s => {
  s.context.actor = 'viewer';
  s.api.rest.repos.getCollaboratorPermissionLevel = async () => ({ data: { permission: 'read' } });
  await assert.rejects(s.prepare(), /Write access/);
  assert.equal(s.calls.length, 0);
}));

test('closed PRs, forks and removed opt-in labels never reach inference', () => scenario(async s => {
  s.pr.labels = []; await assert.rejects(s.prepare(), /ai:autofix/);
  s.pr.labels = [{ name: 'ai:autofix' }]; s.pr.state = 'closed'; await assert.rejects(s.prepare(), /open/);
  s.pr.state = 'open'; s.pr.head.repo.full_name = 'fork/catalog'; await assert.rejects(s.prepare(), /same-repository/);
  assert.equal(s.calls.length, 0);
}));

test('a newer PR commit discards stale review without mutating loop state', () => scenario(async s => {
  s.pr.head.sha = second; await s.prepare();
  assert.equal(s.outputs.ready, 'false'); assert.equal(s.calls.length, 0);
}));

test('scope violations and an outdated base stop before reserving a model call', () => scenario(async s => {
  s.files[0].filename = '.github/workflows/ci.yml';
  await s.prepare(); assert.equal(s.state().attempts.length, 0); assert.match(s.state().reason, /scope/);
  s.files[0].filename = finding.path;
  s.context.sha = second;
  await s.prepare(); assert.equal(s.state().attempts.length, 0); assert.match(s.state().reason, /default branch moved/);
}));

test('unstructured or human-authored reports are not correction instructions', () => scenario(async s => {
  s.comments[0].user.login = 'someone';
  await s.prepare();
  assert.equal(s.state().attempts.length, 0); assert.match(s.state().reason, /structured bot review/);
}));

test('critical P0 findings require human intervention even with green CI', () => scenario(async s => {
  s.comments.length = 0; s.review(head, 100, [{ ...finding, priority: 'P0' }]);
  await s.prepare(); assert.equal(s.state().attempts.length, 0); assert.match(s.state().reason, /P0/);
}));

test('publication rechecks label and exact head/base after candidate validation', () => scenario(async s => {
  const plan = { pr: 3, sha: head, baseSha: base, branch: 'ai/issue-1' };
  await loop.currentPr({ github: s.api, repo: s.context.repo, plan, defaultBranch: 'main' });
  s.pr.head.sha = second;
  await assert.rejects(loop.currentPr({ github: s.api, repo: s.context.repo, plan, defaultBranch: 'main' }), /obsolete/);
  s.pr.head.sha = head; s.pr.labels = [];
  await assert.rejects(loop.currentPr({ github: s.api, repo: s.context.repo, plan, defaultBranch: 'main' }), /ai:autofix/);
}));

test('completed review dispatch passes only a PR number, SHA, and trusted run identifier', () => scenario(async s => {
  const previous = process.env.REVIEW_SHA; process.env.REVIEW_SHA = head;
  try {
    await loop.dispatch({ github: s.api, context: s.context, core: s.core });
    assert.equal(s.calls[0].workflow_id, 'ai-correct.yml'); assert.equal(s.calls[0].ref, 'main');
    assert.deepEqual(s.calls[0].inputs, { pull_request: '3', review_run_id: '200', head_sha: head });
    s.pr.head.sha = second;
    await loop.dispatch({ github: s.api, context: s.context, core: s.core }); assert.equal(s.calls.length, 1);
  } finally { if (previous === undefined) delete process.env.REVIEW_SHA; else process.env.REVIEW_SHA = previous; }
}));
