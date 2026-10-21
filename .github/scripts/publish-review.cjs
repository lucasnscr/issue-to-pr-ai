const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ github, context, core }) => {
  const metadata = JSON.parse(fs.readFileSync(path.join(process.env.REVIEW_DIRECTORY, 'metadata.json'), 'utf8'));
  const { owner, repo } = context.repo;
  const { data: current } = await github.rest.pulls.get({ owner, repo, pull_number: metadata.number });
  if (current.head.sha !== metadata.sha || current.state !== 'open') {
    core.notice('Review discarded because the PR changed while inference was running.');
    return;
  }
  const review = fs.readFileSync('artifacts/review.md', 'utf8').trim();
  const marker = `<!-- continuous-ai-review:${metadata.sha} -->`;
  const body = `${marker}\n${review}\n\n---\nRevisão por IA do commit \`${metadata.sha}\`. A aprovação e o merge cabem a uma pessoa.`;
  if (!review || body.length > 60000) throw new Error('Review is empty or too long to publish.');
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: metadata.number, per_page: 100,
  });
  const existing = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body.includes(marker));
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: metadata.number, body });
  }
};
