import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {api,liveIssue,reauthorize} from './common.mjs';
import {issueSnapshot,targetProfile} from '../local-issue-policy.mjs';
const env=process.env,repo=env.GITHUB_REPOSITORY;
const profile=targetProfile(repo);
const publishMode=env.PUBLISH_MODE||'github';
if(!['github','local'].includes(publishMode))throw Error('Unsupported publication mode.');
const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const directory=env.TASK_DIRECTORY;
mkdirSync(directory,{recursive:true});
if(process.argv[2]==='revalidate'){
  reauthorize(JSON.parse(readFileSync(directory+'/task.json','utf8')));
}else{
  if(!['issue_comment','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||env.GITHUB_REF!==`refs/heads/${event.repository.default_branch}`)throw Error('Trusted default-branch event required.');
  if(env.GITHUB_EVENT_NAME==='issue_comment'&&!/^\s*\/(oc|opencode)(?=\s|$)/i.test(event.comment?.body||'')){
    appendFileSync(env.GITHUB_OUTPUT,'authorized=false\n');process.exit(0);
  }
  if(env.GITHUB_EVENT_NAME==='issue_comment'&&(event.comment?.user?.type!=='User'||event.comment.user.login!==env.GITHUB_ACTOR))throw Error('Authorized human implementation command required.');
  const number=Number(event.issue?.number||event.inputs?.issue);
  if(!Number.isSafeInteger(number)||number<1)throw Error('Invalid issue.');
  const issue=liveIssue(repo,number),branch=event.repository.default_branch;
  const task={version:1,repository:repo,profile,publishMode,issue:number,actor:env.GITHUB_ACTOR,branch,
    base:api(`repos/${repo}/commits/${encodeURIComponent(branch)}`).sha,hash:issueSnapshot(issue),
    title:issue.title,body:issue.body,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT};
  reauthorize(task);writeFileSync(directory+'/task.json',JSON.stringify(task,null,2)+'\n');
  writeFileSync(directory+'/task.md',`Repository: ${repo}\nIssue #${number}\n<untrusted_issue>\n${issue.title}\n${issue.body}\n</untrusted_issue>\n`);
  for(const [key,value] of Object.entries({authorized:'true',base:task.base,issue:number,profile}))appendFileSync(env.GITHUB_OUTPUT,key+'='+value+'\n');
}
console.log('Issue/base/actor authorization confirmed; no model or publication token was released.');
