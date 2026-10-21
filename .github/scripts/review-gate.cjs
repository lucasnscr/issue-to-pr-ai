const report = require('./review-report.cjs');
const loop = require('./engineering-loop.cjs');
const triage = require('./review-triage.cjs');
const CHECK = 'AI review gate';
const workerPath = '.github/workflows/ai-review-gate.yml';
const access = permission => ['write', 'maintain', 'admin'].includes(permission);
const result = (conclusion, title, summary) => ({ conclusion, title, summary });

async function activate({ github, repo, number }) {
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (pr.state !== 'open') return;
  await publish({ github, repo, pr, forceNew: true, assessment: result('action_required', 'Revisão requerida: reavaliando liberação', 'A autorização de revisão invalida a liberação anterior até a reconciliação dos dados atuais.') });
  const comments = await github.paginate(github.rest.issues.listComments, { ...repo, issue_number: number, per_page: 100 });
  if (!comments.some(c => c.user?.login === triage.BOT && c.body?.startsWith(triage.REQUIRED))) {
    await github.rest.issues.createComment({ ...repo, issue_number: number,
      body: `${triage.REQUIRED}\nRevisão por IA requerida nesta PR. Remover labels não apaga a autorização registrada. O check é reavaliado para cada SHA; triagem e merge são decisões distintas.` });
  }
}

async function permission(github, repo, actor, cache) {
  if (!cache.has(actor)) {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: actor });
    cache.set(actor, data.permission);
  }
  return cache.get(actor);
}

async function trustedRun(github, repo, id, attempt, path, defaultBranch) {
  let { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: id });
  if (run.run_attempt !== attempt && github.rest.actions.getWorkflowRunAttempt) {
    ({ data: run } = await github.rest.actions.getWorkflowRunAttempt({ ...repo, run_id: id, attempt_number: attempt }));
  }
  if (run.path !== path || run.event !== 'workflow_dispatch' || run.head_branch !== defaultBranch ||
      run.head_repository?.full_name !== `${repo.owner}/${repo.repo}` || run.run_attempt !== attempt) throw new Error('Untrusted review or triage workflow provenance.');
  return run;
}

async function latestReview(github, repo, pr, comments, defaultBranch) {
  const marker = `<!-- continuous-ai-review:${pr.head.sha} -->`;
  const candidates = comments.filter(c => c.user?.login === triage.BOT && c.body?.includes(marker));
  if (candidates.length > 1) throw new Error('Multiple current reviews require investigation.');
  if (!candidates.length) return null;
  const envelope = report.decodeEnvelope(candidates[0].body);
  if (envelope.sha !== pr.head.sha || envelope.pr !== pr.number || envelope.repository !== `${repo.owner}/${repo.repo}`) throw new Error('Review identity does not match this PR and SHA.');
  const run = await trustedRun(github, repo, envelope.runId, envelope.runAttempt, '.github/workflows/ai-review.yml', defaultBranch);
  if (run.status !== 'completed') return null;
  if (run.conclusion !== 'success') throw new Error('The source review did not complete successfully.');
  return envelope;
}

async function ciState(github, repo, sha) {
  const { data } = await github.rest.actions.listWorkflowRuns({ ...repo, workflow_id: 'ci.yml', head_sha: sha, per_page: 100 });
  const runs = data.workflow_runs.filter(r => r.head_sha === sha && r.head_repository?.full_name === `${repo.owner}/${repo.repo}` && ['pull_request', 'workflow_dispatch'].includes(r.event));
  const dispatched = runs.filter(r => r.event === 'workflow_dispatch');
  const latest = (dispatched.length ? dispatched : runs).sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.status !== 'completed') return 'waiting';
  return latest.conclusion === 'success' ? 'success' : 'failure';
}

async function reconcileDecisions({ github, repo, pr, comments, envelope, record, running, acknowledgeAfter, context, defaultBranch, cache }) {
  const receipts = comments.filter(c => c.user?.login === triage.BOT && c.body?.startsWith(triage.MARKER)).map(c => triage.decodeReceipt(c.body));
  const identifiers = new Set(envelope.review.findings.map(triage.findingId));
  const cycle = record.id ? triage.cycleId(record.state) : null;
  const canAcknowledge = record.id && !running && ['needs-human', 'active'].includes(record.state.status);
  const validTarget = (command, source) => command.target.startsWith('f-') ? identifiers.has(command.target) :
    command.target === cycle && canAcknowledge && Number.isFinite(acknowledgeAfter) && Date.parse(source.created_at) >= acknowledgeAfter;
  const sources = comments.filter(c => c.user?.type === 'User' && c.user.login !== triage.BOT).sort((a, b) => a.id - b.id);
  for (const source of sources) {
    const command = triage.parseCommand(source.body);
    if (!command || command.sha !== pr.head.sha || command.reviewRunId !== envelope.runId ||
        !validTarget(command, source) ||
        source.created_at !== source.updated_at || !access(await permission(github, repo, source.user.login, cache))) continue;
    const existing = receipts.filter(r => r.sourceCommentId === source.id);
    if (existing.length > 1) throw new Error('Duplicate triage receipts require investigation.');
    if (existing.length) continue;
    const receipt = { version: 1, repository: `${repo.owner}/${repo.repo}`, pr: pr.number, ...command,
      actor: source.user.login, sourceCommentId: source.id, sourceHash: triage.hash(source.body),
      workerRunId: context.runId, workerRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1) };
    await github.rest.issues.createComment({ ...repo, issue_number: pr.number, body: triage.renderReceipt(receipt) });
    receipts.push(receipt);
  }
  const decisions = new Map();
  for (const receipt of receipts.sort((a, b) => a.sourceCommentId - b.sourceCommentId)) {
    if (receipt.repository !== `${repo.owner}/${repo.repo}` || receipt.pr !== pr.number) throw new Error('Triage receipt belongs to another PR.');
    if (receipt.sha !== pr.head.sha || receipt.reviewRunId !== envelope.runId) continue;
    const source = sources.find(c => c.id === receipt.sourceCommentId);
    if (!source || source.user.login !== receipt.actor || triage.hash(source.body) !== receipt.sourceHash || source.created_at !== source.updated_at ||
        !access(await permission(github, repo, receipt.actor, cache))) continue;
    const command = triage.parseCommand(source.body);
    if (!command || !validTarget(command, source) || ['sha', 'reviewRunId', 'target', 'action', 'reason'].some(key => command[key] !== receipt[key])) continue;
    if (receipt.workerRunId !== context.runId) await trustedRun(github, repo, receipt.workerRunId, receipt.workerRunAttempt, workerPath, defaultBranch);
    decisions.set(receipt.target, receipt);
  }
  return { decisions, cycle, canAcknowledge };
}

async function assess({ github, repo, pr, comments, context, forceRequired = false, defaultBranch }) {
  const required = forceRequired || pr.labels?.some(l => ['ai:ready', 'ai:autofix'].includes(l.name)) ||
    comments.some(c => c.user?.login === triage.BOT && (c.body?.startsWith(triage.REQUIRED) || c.body?.includes('<!-- continuous-ai-review:') || c.body?.startsWith(loop.STATE_MARKER || '<!-- continuous-ai-engineering-state:v1 -->')));
  if (!required) return result('success', 'Fluxo manual: revisão por IA não autorizada', 'A CI e as regras de revisão da branch continuam obrigatórias.');
  if (pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}`) return result('action_required', 'PR de fork requer entrega interna', 'O fluxo de revisão automatizada aceita somente branches deste repositório.');
  if (!comments.some(c => c.user?.login === triage.BOT && c.body?.startsWith(triage.REQUIRED))) {
    await github.rest.issues.createComment({ ...repo, issue_number: pr.number,
      body: `${triage.REQUIRED}\nRevisão por IA requerida nesta PR. Remover labels não apaga a autorização registrada. O check é reavaliado para cada SHA; triagem e merge são decisões distintas.` });
  }
  const envelope = await latestReview(github, repo, pr, comments, defaultBranch);
  if (!envelope) return result('action_required', 'Aguardando revisão confiável do SHA atual', `Solicite AI review por dispatch da branch padrão para a PR #${pr.number}. Decisões de outro SHA não liberam este commit.`);
  const record = loop.readState(comments, pr.number);
  let running = false;
  let acknowledgeAfter = record.id ? Date.parse(comments.find(c => c.id === record.id).updated_at) : NaN;
  for (const attempt of record.state.attempts) {
    const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: attempt.runId });
    if (run.status !== 'completed') running = true;
    acknowledgeAfter = Math.max(acknowledgeAfter, Date.parse(run.updated_at));
  }
  const cache = new Map();
  const { decisions, cycle, canAcknowledge } = await reconcileDecisions({ github, repo, pr, comments, envelope, record, running, acknowledgeAfter, context, defaultBranch, cache });
  const ci = await ciState(github, repo, pr.head.sha);
  if (ci !== 'success') return result(ci === 'failure' ? 'failure' : 'action_required', ci === 'failure' ? 'CI não aprovada para este SHA' : 'Aguardando CI do SHA atual', 'Uma decisão de triagem não substitui testes aprovados do commit atual.');
  if (running) return result('action_required', 'Correção ainda em execução', 'Aguarde o encerramento das execuções reservadas antes de decidir a liberação.');
  const unresolved = envelope.review.findings.filter(f => decisions.get(triage.findingId(f))?.action !== 'dismiss');
  const commands = unresolved.map(f => {
    const id = triage.findingId(f);
    return `- **${id} (${f.priority})**: ${f.title}\n  \`/ai-triage ${pr.head.sha} ${envelope.runId} ${id} dismiss JUSTIFICATIVA\`\n  Use confirm ou investigate quando o achado precisar de correção/investigação.`;
  }).join('\n');
  const stop = canAcknowledge && decisions.get(cycle)?.action !== 'acknowledge';
  if (unresolved.length || stop) return result('action_required', 'Triagem necessária para liberar este SHA',
    `Revisão ${envelope.runId}. Cada decisão exige colaborador com escrita e justificativa de 10 a 1000 caracteres.\n\n${commands}` +
    (stop ? `\n\nA parada do ciclo exige reconhecimento explícito, preservando reservas e histórico:\n\`/ai-triage ${pr.head.sha} ${envelope.runId} ${cycle} acknowledge JUSTIFICATIVA\`` : ''));
  if (record.id && !canAcknowledge && record.state.status !== 'ready-for-human') return result('action_required', 'Aguardando conclusão do controlador', 'Acompanhe o estado do ciclo e as execuções; ele ainda não concluiu a avaliação.');
  if (!record.id && pr.labels?.some(l => l.name === 'ai:autofix') && envelope.review.findings.length) return result('action_required', 'Aguardando controlador ou interrupção deliberada', 'O corretor foi autorizado. Para tratar manualmente, interrompa essa autorização antes de decidir a entrega.');
  return result('success', 'CI e triagem aprovadas para o SHA atual', `Revisão ${envelope.runId}; ${envelope.review.findings.length} achado(s) avaliados. O estado e as reservas do ciclo foram preservados. O mantenedor decide aprovação e merge.`);
}

async function currentCheck(github, repo, sha) {
  const { data } = await github.rest.checks.listForRef({ ...repo, ref: sha, check_name: CHECK, filter: 'latest', per_page: 100 });
  const existing = data.check_runs.filter(c => c.name === CHECK && c.external_id === `continuous-ai-gate:v1:${sha}` && c.app?.slug === 'github-actions');
  if (existing.length > 1) throw new Error('Ambiguous release checks.');
  return existing[0] || null;
}

async function publish({ github, repo, pr, assessment, forceNew = false, expectedGeneration }) {
  const externalId = `continuous-ai-gate:v1:${pr.head.sha}`;
  const existing = await currentCheck(github, repo, pr.head.sha);
  if (assessment.conclusion === 'success' && expectedGeneration !== undefined && (existing?.id || null) !== expectedGeneration) return false;
  const fields = { name: CHECK, status: 'completed', conclusion: assessment.conclusion, completed_at: new Date().toISOString(),
    external_id: externalId, details_url: pr.html_url,
    output: { title: assessment.title, summary: assessment.summary.slice(0, 60000) } };
  if (existing && !forceNew) await github.rest.checks.update({ ...repo, check_run_id: existing.id, ...fields });
  else await github.rest.checks.create({ ...repo, head_sha: pr.head.sha, ...fields });
  return true;
}

async function run({ github, context, core }) {
  const repo = context.repo;
  const number = Number(context.payload.inputs?.pull_request);
  if (!report.integer(number)) throw new Error('Valid PR number required.');
  if (context.actor !== triage.BOT && !access((await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: context.actor })).data.permission)) throw new Error('Write access required.');
  const { data: requested } = await github.rest.pulls.get({ ...repo, pull_number: number });
  let prs;
  try {
    prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 });
    if (prs.length > 100) throw new Error('Gate reconciliation supports at most 100 open PRs.');
  } catch {
    if (requested.state === 'open') await publish({ github, repo, pr: requested,
      assessment: result('failure', 'Falha ao consultar as PRs', 'A consulta da liberação falhou. Inspecione esta execução.') });
    return;
  }
  const groups = new Map();
  try {
    for (const item of prs) {
      const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: item.number });
      if (pr.state !== 'open') continue;
      if (!groups.has(pr.head.sha)) groups.set(pr.head.sha, []);
      groups.get(pr.head.sha).push(pr);
    }
  } catch {
    for (const pr of prs) if (report.SHA.test(pr.head?.sha || '')) await publish({ github, repo, pr,
      assessment: result('failure', 'Falha ao consultar os commits das PRs', 'A reconciliação não pode liberar commits sem consultar as PRs atuais.') });
    return;
  }
  for (const peers of groups.values()) {
    const pr = peers[0];
    const expectedGeneration = (await currentCheck(github, repo, pr.head.sha))?.id || null;
    let assessment;
    try {
      const results = [];
      for (const peer of peers) {
        const comments = await github.paginate(github.rest.issues.listComments, { ...repo, issue_number: peer.number, per_page: 100 });
        if (comments.length > 1000) throw new Error('Too many comments; manual investigation required.');
        results.push(await assess({ github, repo, pr: peer, comments, context,
          defaultBranch: context.payload.repository.default_branch }));
      }
      // Required checks belong to commits: an unlabelled second PR at the same
      // SHA must not replace a blocked AI decision with a manual-path success.
      const rank = { success: 0, action_required: 1, failure: 2 };
      assessment = results.sort((a, b) => rank[b.conclusion] - rank[a.conclusion])[0];
      assessment.summary = `PRs neste SHA: ${peers.map(p => '#' + p.number).join(', ')}.\n\n` + assessment.summary;
      for (const peer of peers) {
        const { data: latest } = await github.rest.pulls.get({ ...repo, pull_number: peer.number });
        if (latest.state !== 'open' || latest.head.sha !== peer.head.sha) throw new Error('PR changed during gate reconciliation.');
      }
    } catch {
      assessment = result('failure', 'Falha ao verificar a liberação', 'Não foi possível verificar revisão, procedência, decisões, ciclo ou CI. Inspecione esta execução; o erro não libera a entrega.');
    }
    const published = await publish({ github, repo, pr, assessment, expectedGeneration });
    core.notice(published ? `${CHECK}: ${assessment.conclusion} — ${assessment.title}` : 'A newer invalidation superseded this release decision.');
  }
}

async function route({ github, context, core }) {
  const repo = context.repo;
  let numbers = [], forceRequired = false;
  if (context.eventName === 'issue_comment') {
    if (!context.payload.issue?.pull_request || context.payload.comment?.user?.type !== 'User') return;
    const command = triage.parseCommand(context.payload.comment.body);
    const changed = ['edited', 'deleted'].includes(context.payload.action) &&
      [context.payload.comment.body, context.payload.changes?.body?.from].some(body => /^\s*\/ai-triage\b/.test(body || ''));
    if (!changed && (!command || context.payload.comment.user.login !== context.actor ||
        !access((await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: context.actor })).data.permission))) return;
    numbers = [context.payload.issue.number];
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: numbers[0] });
    if (changed || pr.head.sha === command.sha) {
      await publish({ github, repo, pr, forceNew: true, assessment: result('action_required', 'Reavaliando decisão de triagem', 'Uma decisão nova requer a reconciliação dos dados atuais.') });
    }
  } else if (context.eventName === 'pull_request_target') {
    numbers = [context.payload.pull_request.number];
    forceRequired = ['ai:ready', 'ai:autofix'].includes(context.payload.label?.name) || context.payload.pull_request.labels?.some(l => ['ai:ready', 'ai:autofix'].includes(l.name));
  } else if (context.eventName === 'workflow_run') {
    if (!report.integer(context.payload.workflow_run?.id)) return;
    const { data: source } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: context.payload.workflow_run.id });
    if (source.head_repository?.full_name !== `${repo.owner}/${repo.repo}` || !['.github/workflows/ci.yml', '.github/workflows/ai-review.yml', '.github/workflows/ai-correct.yml'].includes(source.path)) return;
    const title = source.display_title?.match(/^AI (?:review|engineering) PR #([1-9]\d*)$/);
    if (title) numbers = [Number(title[1])];
    else if (source.path === '.github/workflows/ci.yml') {
      const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', head: `${repo.owner}:${source.head_branch}`, per_page: 100 });
      numbers = prs.filter(pr => pr.head.sha === source.head_sha).map(pr => pr.number);
    }
  }
  for (const number of new Set(numbers)) {
    if (!report.integer(number)) continue;
    if (forceRequired) await activate({ github, repo, number });
    await github.rest.actions.createWorkflowDispatch({ ...repo, workflow_id: 'ai-review-gate.yml',
      ref: context.payload.repository.default_branch, inputs: { pull_request: String(number) } });
  }
  core.notice('Release gate reconciliation requested; source code was not executed.');
}

module.exports = { CHECK, activate, assess, ciState, latestReview, reconcileDecisions, currentCheck, publish, run, route, trustedRun };
