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
  // The worker receipt uses the current Actions attempt; the mocked worker
  // must describe that same attempt, including when CI itself is rerun.
  runs.get(900).run_attempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1);
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

function native(s) {
  s.context.eventName = 'pull_request_target'; s.context.payload.pull_request = structuredClone(s.pr);
  const failures = [];
  s.core.setFailed = value => failures.push(value);
  s.core.summary = { addHeading() { return this; }, addRaw() { return this; }, async write() {} };
  return { verify: () => gate.verify({ github: s.github, context: s.context, core: s.core }), failures };
}

module.exports = { fixture, native, gate, triage, report, loop, sha, next, finding, target, timestamp };
