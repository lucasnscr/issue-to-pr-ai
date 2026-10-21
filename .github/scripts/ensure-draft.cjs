const { execFileSync } = require('node:child_process');

// Normalize only the PR for the branch actually left by the implementation CLI.
module.exports = async ({ github, context, core,
  getHeadBranch = () => execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() }) => {
  core.setOutput('pull-request', '');
  const branch = getHeadBranch();
  if (!branch || branch === context.payload.repository?.default_branch) {
    core.notice('No implementation branch was left by the agent; no PR was changed.');
    return;
  }
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  const pulls = await github.paginate(github.rest.pulls.list, {
    owner, repo, head: `${owner}:${branch}`, state: 'open', per_page: 100,
  });
  const matching = pulls.filter(pr => pr.state === 'open' && pr.head.ref === branch &&
    pr.head.repo?.full_name === repository && pr.base.repo?.full_name === repository);
  if (matching.length === 0) {
    core.notice('No open pull request exists for the implementation branch.');
    return;
  }
  if (matching.length !== 1) throw new Error('More than one PR matches the implementation branch; normalize manually.');
  const pr = matching[0];
  if (!pr.draft) {
    await github.graphql(`mutation($pullRequestId: ID!) {
      convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) { pullRequest { isDraft } }
    }`, { pullRequestId: pr.node_id });
  }
  core.setOutput('pull-request', String(pr.number));
};
