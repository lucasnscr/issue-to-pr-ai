const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ github, context, core }) => {
  const issueNumber = Number(process.env.LIVE_TEST_ISSUE);
  const baseRef = process.env.LIVE_TEST_BASE_REF;
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || !baseRef || baseRef === 'ai/live-test') {
    throw new Error('Configure AI_LIVE_TEST_ISSUE and AI_LIVE_TEST_BASE_REF before starting the test.');
  }
  const { owner, repo } = context.repo;
  const { data: access } = await github.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: context.actor });
  if (!['admin', 'maintain', 'write'].includes(access.permission)) throw new Error('Write access is required.');
  const { data: base } = await github.rest.repos.getCommit({ owner, repo, ref: baseRef });
  if (base.sha !== context.sha) throw new Error('The test branch must point to the exact base branch commit.');
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: issueNumber });
  if (issue.pull_request || issue.state !== 'open' || !issue.labels.some(label => label.name === 'ai:ready')) {
    throw new Error('The selected item must be an open issue labeled ai:ready.');
  }
  if (!issue.body || issue.body.length > 20000) throw new Error('Issue description is empty or exceeds the test limit.');
  const task = path.join(process.env.RUNNER_TEMP, 'live-task.md');
  fs.writeFileSync(task,
    `Repository: ${owner}/${repo}\nIssue: #${issue.number}\nTitle: ${issue.title}\n\n` +
    'Implement the category-filter acceptance criteria below. Do not commit, push, create PRs, or change workflows/configuration.\n' +
    'Only change application source/tests and Markdown documentation. Add PostgreSQL integration tests.\n\n' + issue.body);
  core.setOutput('task', task);
  core.setOutput('issue', String(issueNumber));
  core.setOutput('base_ref', baseRef);
  core.setOutput('base_sha', base.sha);
  core.setOutput('branch', `ai/issue-${issueNumber}-${context.runId}`);
};
