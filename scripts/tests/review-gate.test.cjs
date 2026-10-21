const { test } = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../../.github/scripts/review-gate.cjs');
const triage = require('../../.github/scripts/review-triage.cjs');
const report = require('../../.github/scripts/review-report.cjs');
const loop = require('../../.github/scripts/engineering-loop.cjs');
const sha = 'a'.repeat(40), next = 'b'.repeat(40);
const finding = { priority: 'P2', path: 'apps/catalog-api/src/main/java/Product.java', line: 2,
  title: 'Preço inválido', body: 'O ramo retorna preço negativo para esta entrada.' };
const target = triage.findingId(finding);
const timestamp = '2026-10-21T10:02:00Z';

function fixture() {
  const repo = { owner: 'example', repo: 'catalog' };
  const context = { repo, actor: triage.BOT, runId: 900,
    payload: { repository: { default_branch: 'main' }, inputs: { pull_request: '3' } } };
  const pr = { number: 3, state: 'open', html_url: 'https://example.test/pull/3',
    head: { sha, ref: 'feature', repo: { full_name: 'example/catalog' } },
    base: { ref: 'main' }, labels: [{ name: 'ai:ready' }] };
  const prs = [pr], comments = new Map([[3, []]]), checks = [], dispatches = [], notices = [];
  const workflow = (id, path) => ({ id, run_attempt: 1, path: `.github/workflows/${path}.yml`,
    event: 'workflow_dispatch', head_branch: 'main', head_repository: { full_name: 'example/catalog' },
    status: 'completed', conclusion: 'success', updated_at: '2026-10-21T10:01:00Z' });
  const runs = new Map([[100, workflow(100, 'ai-review')], [900, workflow(900, 'ai-review-gate')]]);
  const ci = [{ ...workflow(99, 'ci'), head_sha: sha }];
  const permission = new Map([['writer', 'write'], ['reader', 'read']]);
  const add = (body, login = triage.BOT, number = 3) => {
    const value = { id: 1000 + [...comments.values()].flat().length, body, user: { login, type: login === triage.BOT ? 'Bot' : 'User' },
      created_at: timestamp, updated_at: timestamp };
    comments.get(number).push(value); return value;
  };
  const github = { rest: {
    repos: { getCollaboratorPermissionLevel: async ({ username }) => ({ data: { permission: permission.get(username) || 'none' } }) },
    pulls: { get: async ({ pull_number }) => ({ data: structuredClone(prs.find(p => p.number === pull_number)) }), list() {} },
    issues: { listComments() {}, createComment: async value => ({ data: add(value.body, triage.BOT, value.issue_number) }) },
    actions: { getWorkflowRun: async ({ run_id }) => {
      assert(runs.has(run_id), `missing run ${run_id}`); return { data: structuredClone(runs.get(run_id)) };
    }, listWorkflowRuns: async () => ({ data: { workflow_runs: structuredClone(ci) } }),
    createWorkflowDispatch: async value => dispatches.push(value) },
    checks: { listForRef: async ({ ref }) => ({ data: { check_runs: checks.filter(c => c.head_sha === ref).slice(-1) } }),
      create: async value => {
        const data = { ...value, id: 5000 + checks.length, app: { slug: 'github-actions' } };
        checks.push(data); return { data };
      }, update: async value => { const check = checks.find(c => c.id === value.check_run_id); Object.assign(check, value); return { data: check }; } },
  }, paginate: async (method, args) => method === github.rest.pulls.list ? structuredClone(prs) : structuredClone(comments.get(args.issue_number)) };
  const core = { notice: value => notices.push(value) };
  const review = (findings = [finding], number = 3) => add(`<!-- continuous-ai-review:${prs.find(p => p.number === number).head.sha} -->\n` + report.encodeEnvelope({
    version: 1, repository: 'example/catalog', pr: number, sha: prs.find(p => p.number === number).head.sha,
    runId: 100, runAttempt: 1, estimatedCostUsd: 0.1, usageComplete: true, policyDecision: 'allow', review: { summary: 'Revisão.', findings },
  }), triage.BOT, number);
  const command = (action = 'dismiss', who = 'writer', id = target, value = sha, runId = 100) =>
    add(`/ai-triage ${value} ${runId} ${id} ${action} Verificado com evidência reproduzível.`, who);
  const assess = () => gate.assess({ github, repo, pr, comments: structuredClone(comments.get(3)), context, defaultBranch: 'main' });
  const run = () => gate.run({ github, context, core });
  const route = () => gate.route({ github, context, core });
  const state = (status = 'needs-human', running = false) => {
    const value = { version: 1, pr: 3, status, reason: 'Limite atingido.', reviews: [],
      attempts: [{ number: 1, sha: next, runId: 200, reviewRunId: 100, status: 'failed' }] };
    const comment = add(loop.renderState(value)); comment.updated_at = '2026-10-21T10:00:00Z';
    runs.set(200, { ...workflow(200, 'ai-correct'), status: running ? 'in_progress' : 'completed' });
    return { value, comment };
  };
  return { repo, context, pr, prs, comments, checks, dispatches, notices, runs, ci, permission, add, github, core, review, command, assess, run, route, state };
}

test('triage grammar binds a full commit, review run and stable finding or cycle identifier', () => {
  const s = fixture(); const body = s.command().body;
  assert.equal(triage.parseCommand(body).target, target);
  for (const bad of [body.replace(sha, 'aaaaaaa'), body.replace('100 ', '0 '), body.replace('dismiss', 'approve'),
    body.replace(target, 'cycle-' + 'a'.repeat(16)), body.replace('Verificado com evidência reproduzível.', 'curto')]) assert.equal(triage.parseCommand(bad), null);
  assert.equal(triage.findingId({ ...finding }), target);
  assert.notEqual(triage.findingId({ ...finding, priority: 'P1' }), target);
  assert.notEqual(triage.findingId({ ...finding, body: 'Outra evidência' }), target);
});

test('authorized dismissal creates one receipt and releases only current findings; a later confirmation blocks', async () => {
  const s = fixture(); s.review();
  assert.equal((await s.assess()).conclusion, 'action_required');
  s.command(); assert.equal((await s.assess()).conclusion, 'success');
  const count = s.comments.get(3).length;
  assert.equal((await s.assess()).conclusion, 'success'); assert.equal(s.comments.get(3).length, count);
  s.command('confirm'); assert.equal((await s.assess()).conclusion, 'action_required');
  s.command('investigate'); assert.equal((await s.assess()).conclusion, 'action_required');
  s.command(); assert.equal((await s.assess()).conclusion, 'success');
});

test('read-only actors, bots, edited commands, stale reviews and unknown findings never authorize release', async () => {
  for (const mutate of [s => s.command('dismiss', 'reader'), s => s.command('dismiss', triage.BOT),
    s => { s.command().updated_at = '2026-10-21T10:03:00Z'; }, s => s.command('dismiss', 'writer', target, next),
    s => s.command('dismiss', 'writer', target, sha, 101), s => s.command('dismiss', 'writer', 'f-' + '0'.repeat(16))]) {
    const s = fixture(); s.review(); mutate(s);
    assert.equal((await s.assess()).conclusion, 'action_required');
  }
});

test('editing or deleting a decision, or revoking actor permission, invalidates its existing receipt', async () => {
  for (const mutate of [(s, c) => { c.body += ' texto'; c.updated_at = '2026-10-21T10:04:00Z'; },
    (s, c) => s.comments.get(3).splice(s.comments.get(3).indexOf(c), 1), s => s.permission.set('writer', 'read')]) {
    const s = fixture(); s.review(); const c = s.command(); assert.equal((await s.assess()).conclusion, 'success');
    mutate(s, c); assert.equal((await s.assess()).conclusion, 'action_required');
  }
});

test('deleting the latest confirmation cannot resurrect an older dismissal', async () => {
  const s = fixture(); s.review(); s.command(); await s.assess();
  const confirmed = s.command('confirm'); await s.assess();
  s.comments.get(3).splice(s.comments.get(3).indexOf(confirmed), 1);
  assert.equal((await s.assess()).conclusion, 'action_required');
  s.command(); assert.equal((await s.assess()).conclusion, 'success');
});

test('receipts require the original source hash, actor and trusted worker provenance', async () => {
  const s = fixture(); s.review(); s.command(); await s.assess();
  const receipt = s.comments.get(3).find(c => c.body.startsWith(triage.MARKER));
  const value = triage.decodeReceipt(receipt.body); value.workerRunId = 901;
  s.runs.set(901, { ...s.runs.get(900), id: 901, head_branch: 'feature' });
  receipt.body = triage.renderReceipt(value);
  await assert.rejects(s.assess(), /Untrusted/);
  s.runs.get(901).head_branch = 'main'; assert.equal((await s.assess()).conclusion, 'success');
  value.sourceHash = '0'.repeat(64); receipt.body = triage.renderReceipt(value);
  assert.equal((await s.assess()).conclusion, 'action_required');
});

test('a new SHA requires a fresh review; removing labels preserves recorded authorization', async () => {
  const s = fixture(); s.review(); s.command(); await s.assess();
  s.pr.labels = []; s.pr.head.sha = next;
  assert.equal((await s.assess()).conclusion, 'action_required');
  s.review([]); s.ci[0].head_sha = next;
  assert.equal((await s.assess()).conclusion, 'success');
});

test('review branch, event, workflow, repository, conclusion and duplicate identities fail closed', async () => {
  for (const change of [{ head_branch: 'feature' }, { event: 'pull_request' }, { path: '.github/workflows/ci.yml' },
    { head_repository: { full_name: 'fork/catalog' } }, { conclusion: 'failure' }]) {
    const s = fixture(); s.review([]); Object.assign(s.runs.get(100), change); await assert.rejects(s.assess());
  }
  const s = fixture(); s.review([]); s.review([]); await assert.rejects(s.assess(), /Multiple/);
});

test('a source workflow rerun verifies the referenced run attempt rather than trusting the latest attempt', async () => {
  const s = fixture(); s.review([]); const original = structuredClone(s.runs.get(100)); s.runs.get(100).run_attempt = 2;
  s.github.rest.actions.getWorkflowRunAttempt = async ({ attempt_number }) => {
    assert.equal(attempt_number, 1); return { data: original };
  };
  assert.equal((await s.assess()).conclusion, 'success');
  delete s.github.rest.actions.getWorkflowRunAttempt; await assert.rejects(s.assess(), /Untrusted/);
});

test('triage cannot replace CI and matching explicit CI takes precedence over a waiting native run', async () => {
  const s = fixture(); s.review([]);
  s.ci[0].head_sha = next; assert.equal((await s.assess()).conclusion, 'action_required');
  s.ci[0].head_sha = sha; s.ci[0].conclusion = 'failure'; assert.equal((await s.assess()).conclusion, 'failure');
  s.ci[0].conclusion = 'success'; s.ci.push({ ...s.ci[0], id: 101, event: 'pull_request', status: 'waiting' });
  assert.equal((await s.assess()).conclusion, 'success');
});

test('stopped corrections require a post-completion cycle acknowledgement without resetting reservations', async () => {
  const s = fixture(); s.review([]); const record = s.state(); const before = record.comment.body;
  assert.equal((await s.assess()).conclusion, 'action_required');
  s.command('acknowledge', 'writer', triage.cycleId(record.value));
  assert.equal((await s.assess()).conclusion, 'success');
  assert.equal(record.comment.body, before); assert.equal(loop.reservedBudget(record.value), 5);
});

test('a running correction or an acknowledgement created before completion cannot clear a stop', async () => {
  const s = fixture(); s.review([]); const record = s.state('needs-human', true);
  const c = s.command('acknowledge', 'writer', triage.cycleId(record.value)); c.created_at = c.updated_at = '2026-10-21T09:00:00Z';
  assert.equal((await s.assess()).conclusion, 'action_required');
  s.runs.get(200).status = 'completed'; assert.equal((await s.assess()).conclusion, 'action_required');
  s.command('acknowledge', 'writer', triage.cycleId(record.value)); assert.equal((await s.assess()).conclusion, 'success');
});

test('the worker reconciles queued commands on all PRs and aggregates same-SHA peers conservatively', async () => {
  const s = fixture(); const other = structuredClone(s.pr); other.number = 4; other.labels = [];
  s.prs.push(other); s.comments.set(4, []); s.context.payload.inputs.pull_request = '4'; s.review();
  await s.run(); assert.equal(s.checks.at(-1).conclusion, 'action_required');
  s.command(); await s.run(); assert.equal(s.checks.at(-1).conclusion, 'success');
  assert.match(s.checks.at(-1).output.summary, /#3, #4/);
});

test('a new invalidation generation cannot be overwritten by a stale successful assessment', async () => {
  const s = fixture(); await gate.activate({ github: s.github, repo: s.repo, number: 3 }); const first = s.checks.at(-1).id;
  await gate.activate({ github: s.github, repo: s.repo, number: 3 });
  assert.notEqual(s.checks.at(-1).id, first);
  const published = await gate.publish({ github: s.github, repo: s.repo, pr: s.pr, expectedGeneration: first,
    assessment: { conclusion: 'success', title: 'Stale', summary: 'Stale' } });
  assert.equal(published, false); assert.equal(s.checks.at(-1).conclusion, 'action_required');
});

test('metadata failures and PR changes during reconciliation cannot produce successful checks', async () => {
  const s = fixture(); s.review([]); s.github.rest.actions.getWorkflowRun = async () => { throw new Error('API unavailable'); };
  await s.run(); assert.equal(s.checks.at(-1).conclusion, 'failure');
  const t = fixture(); t.review([]); let gets = 0; const get = t.github.rest.pulls.get;
  t.github.rest.pulls.get = async args => { const r = await get(args); if (++gets >= 3) r.data.head.sha = next; return r; };
  await t.run(); assert.equal(t.checks.at(-1).conclusion, 'failure');
});

test('manual PRs receive an explicit manual-path result and unauthorized dispatch is rejected', async () => {
  const s = fixture(); s.pr.labels = []; await s.run(); assert.equal(s.checks.at(-1).conclusion, 'success');
  assert.match(s.checks.at(-1).output.title, /manual/);
  s.context.actor = 'reader'; await assert.rejects(s.run(), /Write access/);
});

test('authorized triage creation invalidates first and dispatches only trusted reconciliation', async () => {
  const s = fixture(); const c = s.command(); s.context.actor = 'writer'; s.context.eventName = 'issue_comment';
  Object.assign(s.context.payload, { action: 'created', issue: { number: 3, pull_request: {} }, comment: c });
  await s.route(); assert.equal(s.checks.at(-1).conclusion, 'action_required');
  assert.deepEqual(s.dispatches[0].inputs, { pull_request: '3' }); assert.equal(s.dispatches[0].ref, 'main');
  s.context.actor = 'reader'; await s.route(); assert.equal(s.dispatches.length, 1);
});

test('editing to arbitrary text or deleting a triage source invalidates its previous release', async () => {
  for (const action of ['edited', 'deleted']) {
    const s = fixture(); const c = s.command(); const old = c.body; c.body = action === 'edited' ? 'removed command' : old;
    s.context.actor = 'writer'; s.context.eventName = 'issue_comment';
    Object.assign(s.context.payload, { action, issue: { number: 3, pull_request: {} }, comment: c, changes: { body: { from: old } } });
    await s.route(); assert.equal(s.checks.at(-1).conclusion, 'action_required'); assert.equal(s.dispatches.length, 1);
  }
});

test('completion routing verifies the source workflow and obtains PR identity without executing candidate code', async () => {
  const s = fixture(); s.context.eventName = 'workflow_run'; s.context.payload.workflow_run = { id: 100 };
  s.runs.get(100).display_title = 'AI review PR #3'; await s.route(); assert.equal(s.dispatches.length, 1);
  s.runs.get(100).path = '.github/workflows/untrusted.yml'; await s.route(); assert.equal(s.dispatches.length, 1);
});

test('a failed trusted review setup persists the requirement even without labels or model output', async () => {
  const s = fixture(); s.pr.labels = []; s.context.eventName = 'workflow_run'; s.context.payload.workflow_run = { id: 100 };
  Object.assign(s.runs.get(100), { conclusion: 'failure', display_title: 'AI review PR #3' });
  await s.route(); assert(s.comments.get(3).some(c => c.body.startsWith(triage.REQUIRED)));
  assert.equal(s.checks.at(-1).conclusion, 'action_required');
  assert.equal((await s.assess()).conclusion, 'action_required');
});
