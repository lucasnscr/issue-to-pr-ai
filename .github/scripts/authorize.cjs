// Invoked from a trusted checkout by actions/github-script.
module.exports = async ({ github, context, core }) => {
  core.setOutput('agent', '');
  const comment = context.payload.comment;
  if (!comment || comment.user?.type !== 'User' || comment.user.login !== context.actor) return;
  const match = comment.body.trimStart().match(/^(\/opencode|\/oc|@claude)(?=\s|$)/i);
  if (!match) return;
  const { owner, repo } = context.repo;
  const { data: permission } = await github.rest.repos.getCollaboratorPermissionLevel({
    owner, repo, username: context.actor,
  });
  if (!['admin', 'maintain', 'write'].includes(permission.permission)) {
    core.notice('Only collaborators with write access may start an agent.');
    return;
  }
  const { data: issue } = await github.rest.issues.get({
    owner, repo, issue_number: context.payload.issue.number,
  });
  if (issue.state !== 'open' || !issue.labels.some(label => label.name === 'ai:ready')) {
    core.notice('The issue or PR must be open and have the ai:ready label.');
    return;
  }
  if (issue.pull_request) {
    core.notice('Use an issue for implementation. PR review is handled by AI review.');
    return;
  }
  core.setOutput('agent', match[1].toLowerCase() === '@claude' ? 'claude' : 'opencode');
};
