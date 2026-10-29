import {readFileSync,realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {extractCase,eventId} from '../../contracts/sdlc-v1.mjs';
import {changeContext,githubApi} from './github.mjs';
import {sendEvent} from './client.mjs';
export async function notifyLifecycle({env=process.env,api=githubApi,request=fetch,event}={}){
  if(env.SENTINELA_ENABLED!=='true')return {skipped:true};
  const repo=env.GITHUB_REPOSITORY;
  async function send(type,issue,pr,sha,identity,run){
    const marker=extractCase(issue.body);if(!marker)return {skipped:true};
    const extra=run?{runId:run.id,runAttempt:run.run_attempt||1}:{};
    if(type!=='implementation.published')Object.assign(extra,{executionId:identity,reason:type==='pull_request.closed'?'closed_without_merge':type.endsWith('cancelled')?'cancelled':'failure'});
    return sendEvent({type,id:eventId(type,marker.caseId,identity),at:new Date().toISOString(),...marker,...extra,repository:repo,service:env.SENTINELA_SERVICE,environment:env.SENTINELA_ENVIRONMENT,issueNumber:issue.number,pullRequestNumber:pr,commitSha:sha},{env,request});
  }
  if(event?.action==='closed'&&event.pull_request){
    const {pr,issue}=await changeContext({repo,prNumber:event.pull_request.number,commitSha:event.pull_request.head?.sha,allowClosed:true},api);
    if(pr.merged)return {skipped:true};
    return send('pull_request.closed',issue,pr.number,pr.head.sha,`closed-${pr.number}-${pr.head.sha}`);
  }
  const run=event?.workflow_run;
  if(!run||!Number.isSafeInteger(run.id)||run.id<1||run.repository?.full_name!==repo||run.head_repository?.full_name!==repo)throw new Error('CI/execução fora do repositório autorizado.');
  if(!['success','failure','cancelled','timed_out','action_required','startup_failure'].includes(run.conclusion))return {skipped:true};
  const identity=`gha-${run.id}-${run.run_attempt||1}`;
  if(run.name==='AI implementation'){
    if(run.conclusion==='success'||run.event!=='issue_comment'||run.head_branch!==event.repository?.default_branch)return {skipped:true};
    const match=/^AI implementation • issue #([1-9][0-9]*)$/.exec(run.display_title||'');if(!match)return {skipped:true};
    const jobs=await api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
    if(!jobs.jobs?.some(job=>['implement','implementation / Model patch'].includes(job.name)&&job.steps?.some(step=>step.name==='Re-authorize and prepare the issue'&&step.conclusion==='success')))return {skipped:true};
    const issue=await api(`repos/${repo}/issues/${match[1]}`);if(issue.pull_request)return {skipped:true};
    return send(run.conclusion==='cancelled'?'implementation.cancelled':'implementation.failed',issue,null,run.head_sha,identity,run);
  }
  if(run.name!=='CI')return {skipped:true};
  const prs=await api(`repos/${repo}/commits/${run.head_sha}/pulls`);
  const matching=prs.filter(pr=>pr.state==='open'&&pr.head?.sha===run.head_sha&&pr.head?.repo?.full_name===repo&&pr.base?.repo?.full_name===repo);
  if(!matching.length)return {skipped:true};if(matching.length!==1)throw new Error('Mais de uma PR corresponde ao commit.');
  const {issue}=await changeContext({repo,prNumber:matching[0].number,commitSha:run.head_sha},api);
  const type=run.conclusion==='success'?'implementation.published':run.conclusion==='cancelled'?'ci.cancelled':'ci.failed';
  return send(type,issue,matching[0].number,run.head_sha,identity,run);
}
export const notifyImplementation=notifyLifecycle;
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  await notifyLifecycle({event:JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))});
  console.log('Resultado sincronizado; nenhuma autorização de implementação ou merge foi concedida.');
}
