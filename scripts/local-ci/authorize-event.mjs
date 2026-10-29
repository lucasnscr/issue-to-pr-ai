import {issueSnapshot,targetProfile} from '../local-issue-policy.mjs';
import {implementationIdentity,matchesImplementationCommand} from './agent-identity.mjs';
export function authorizeEvent({env,event,request}) {
  const repository=env.GITHUB_REPOSITORY,profile=targetProfile(repository);
  const identity=implementationIdentity({agent:env.IMPLEMENTATION_AGENT||'opencode',model:env.MODEL||'ollama/qwen3-coder:30b'});
  const branch=event.repository?.default_branch;
  if(!['issue_comment','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!branch||env.GITHUB_REF!==`refs/heads/${branch}`)throw Error('Trusted default-branch event required.');
  if(env.GITHUB_EVENT_NAME==='issue_comment'){
    if(!matchesImplementationCommand(event.comment?.body,identity.agent))return null;
    if(event.comment?.user?.type!=='User'||event.comment.user.login!==env.GITHUB_ACTOR)throw Error('Authorized human implementation command required.');
  }
  const issue=Number(event.issue?.number||event.inputs?.issue);
  if(!Number.isSafeInteger(issue)||issue<1)throw Error('Invalid issue.');
  if(!['admin','maintain','write'].includes(request(`repos/${repository}/collaborators/${env.GITHUB_ACTOR}/permission`).permission))throw Error('Write permission required.');
  const current=request(`repos/${repository}/issues/${issue}`);
  const hash=issueSnapshot({...current,state:current.state.toUpperCase()});
  const publishMode=env.PUBLISH_MODE||'github';
  if(!['github','local'].includes(publishMode))throw Error('Unsupported publication mode.');
  return {version:1,repository,profile,publishMode,...identity,issue,actor:env.GITHUB_ACTOR,branch,
    base:request(`repos/${repository}/commits/${encodeURIComponent(branch)}`).sha,hash,
    title:current.title,body:current.body,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT};
}
