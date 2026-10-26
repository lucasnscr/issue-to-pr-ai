import {readFileSync,realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {extractCase,eventId} from '../../contracts/sdlc-v1.mjs';
import {changeContext,githubApi} from './github.mjs';
import {sendEvent} from './client.mjs';
export async function notifyImplementation({env=process.env,api=githubApi,request=fetch,event}={}){
  if(env.SENTINELA_ENABLED!=='true')return {skipped:true};
  const run=event?.workflow_run;
  if(!run||run.conclusion!=='success'||run.repository?.full_name!==env.GITHUB_REPOSITORY||run.head_repository?.full_name!==env.GITHUB_REPOSITORY)throw new Error('Somente CI bem-sucedida do próprio repositório pode notificar a entrega.');
  const prs=await api(`repos/${env.GITHUB_REPOSITORY}/commits/${run.head_sha}/pulls`);
  const matching=prs.filter(pr=>pr.state==='open'&&pr.head?.sha===run.head_sha&&pr.head?.repo?.full_name===env.GITHUB_REPOSITORY&&pr.base?.repo?.full_name===env.GITHUB_REPOSITORY);
  if(!matching.length)return {skipped:true};if(matching.length!==1)throw new Error('Mais de uma PR corresponde ao commit.');
  const {issue}=await changeContext({repo:env.GITHUB_REPOSITORY,prNumber:matching[0].number,commitSha:run.head_sha},api);
  const marker=extractCase(issue.body);if(!marker)return {skipped:true};
  return sendEvent({type:'implementation.published',id:eventId('implementation.published',marker.caseId,run.head_sha),at:new Date().toISOString(),...marker,
    repository:env.GITHUB_REPOSITORY,service:env.SENTINELA_SERVICE,environment:env.SENTINELA_ENVIRONMENT,issueNumber:issue.number,pullRequestNumber:matching[0].number,commitSha:run.head_sha},{env,request});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  await notifyImplementation({event:JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))});
  console.log('Sincronização de PR concluída; nenhuma autorização de implementação ou merge foi concedida.');
}
