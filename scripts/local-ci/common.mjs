import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {issueSnapshot,targetProfile} from '../local-issue-policy.mjs';
import {loadPolicy,evaluateUsage} from '../ai-policy.mjs';
import {implementationIdentity} from './agent-identity.mjs';
export const run=(cmd,args,cwd,options={})=>execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:10485760,...options});
export const gh=(...args)=>run('gh',args);
export const api=path=>JSON.parse(gh('api',path));
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function liveIssue(repo,number){const issue=api(`repos/${repo}/issues/${number}`);return {...issue,state:issue.state.toUpperCase()};}
export function validateTask(task,env=process.env){
  const identity=implementationIdentity(task);
  if((env.IMPLEMENTATION_AGENT&&identity.agent!==env.IMPLEMENTATION_AGENT)||
    (env.MODEL&&identity.model!==env.MODEL))throw Error('Frozen task differs from the trusted agent/model selection.');
  if(task.repository!==env.GITHUB_REPOSITORY||task.profile!==targetProfile(task.repository)||
    !/^[a-f0-9]{40}$/.test(task.base||'')||!/^[a-f0-9]{64}$/.test(task.hash||'')||
    !Number.isSafeInteger(task.issue)||task.issue<1||task.runId!==env.GITHUB_RUN_ID||task.attempt!==env.GITHUB_RUN_ATTEMPT)throw Error('Invalid frozen task identity.');
  return task;
}
export function reauthorize(task){
  validateTask(task);
  if(!['admin','maintain','write'].includes(api(`repos/${task.repository}/collaborators/${task.actor}/permission`).permission))throw Error('Write permission revoked.');
  const issue=liveIssue(task.repository,task.issue);
  if(issueSnapshot(issue)!==task.hash||api(`repos/${task.repository}/commits/${encodeURIComponent(task.branch)}`).sha!==task.base)throw Error('Issue, authorization or base changed.');
  return issue;
}
export function frozen(directory,env=process.env){
  const task=validateTask(JSON.parse(readFileSync(directory+'/task.json','utf8')),env);
  const manifest=JSON.parse(readFileSync(directory+'/manifest.json','utf8'));
  const usage=JSON.parse(readFileSync(directory+'/ai-usage.json','utf8'));
  const patch=readFileSync(directory+'/candidate.patch');
  const identity=implementationIdentity(task);
  if(manifest.runId!==task.runId||manifest.attempt!==task.attempt||manifest.base!==task.base||manifest.patchHash!==hash(patch)||
    (manifest.agent&&manifest.agent!==identity.agent)||
    usage.runId!==task.runId||usage.attempt!==task.attempt||usage.model!==identity.model||usage.profile!=='implementation'||
    (identity.agent==='claude'&&(usage.agent!=='claude'||manifest.agent!=='claude'||manifest.model!==identity.model))||
    usage.outcome!=='completed'||usage.policy?.decision!=='allow'||!usage.usage?.complete||
    !['steps','startedSteps','policyTokenUnits'].every(key=>Number.isSafeInteger(usage.usage[key])&&usage.usage[key]>0)||
    evaluateUsage(loadPolicy('implementation',usage.model),usage.usage).decision!=='allow')throw Error('Invalid frozen candidate or usage.');
  return {task,manifest,usage,patch};
}
