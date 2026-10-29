import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {api,run} from './common.mjs';
import {publicationWorkflow,implementationIdentity} from './agent-identity.mjs';
import {targetProfile} from '../local-issue-policy.mjs';
import {setTimeout as delay} from 'node:timers/promises';
export async function publishValidatedLocal(repo,runId,{signal}={}){
  signal?.throwIfAborted();
  targetProfile(repo);if(!Number.isSafeInteger(runId)||runId<1)throw Error('Invalid implementation run.');
  const deadline=Date.now()+1800000;
  let source,jobs;
  while(Date.now()<deadline){
    signal?.throwIfAborted();
    source=api(`repos/${repo}/actions/runs/${runId}`);
    jobs=api(`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`).jobs;
    if(source.status==='completed'&&source.conclusion!=='success')throw Error('Workflow failed before local publication.');
    if(jobs.some(job=>job.name==='implementation / validate'&&job.conclusion==='success'))break;
    await delay(15000,undefined,{signal});
  }
  const workflow=publicationWorkflow(source.path);
  if(source.head_repository?.full_name!==repo||source.head_branch!==api('repos/'+repo).default_branch)throw Error('Untrusted local publication workflow.');
  if(!jobs.some(job=>job.name==='implementation / validate'&&job.conclusion==='success')||
    !jobs.some(job=>job.name==='implementation / Model patch'&&job.conclusion==='success'))throw Error('Trusted model and validation jobs required.');
  const temporary=mkdtempSync(join(tmpdir(),'validated-local-publisher-'));
  try{
    const frozen=join(temporary,'frozen'),workspace=join(temporary,'candidate');
    run('gh',['run','download',String(runId),'--repo',repo,'--name',`local-frozen-${runId}-${source.run_attempt}`,'--dir',frozen]);
    const manifest=JSON.parse(readFileSync(frozen+'/manifest.json','utf8'));
    if(!/^[a-f0-9]{40}$/.test(manifest.engineSha||'')||!source.referenced_workflows?.some(ref=>ref.sha===manifest.engineSha&&ref.path.startsWith('lucasnscr/issue-to-pr-ai/.github/workflows/'+workflow.reusable+'@')))throw Error('Reusable workflow provenance missing or divergent.');
    const task=JSON.parse(readFileSync(frozen+'/task.json','utf8'));
    if(task.publishMode!=='local')throw Error('Workflow did not request local publication.');
    if(implementationIdentity(task).agent!==workflow.agent)throw Error('Publication agent differs from the trusted workflow.');
    const engine=join(temporary,'engine');
    run('git',['clone','--quiet','https://github.com/lucasnscr/issue-to-pr-ai.git',engine]);
    run('git',['checkout','--quiet','--detach',manifest.engineSha],engine);
    run('git',['clone','--quiet','--branch',task.branch,'https://github.com/'+repo+'.git',workspace]);
    signal?.throwIfAborted();
    run(process.execPath,[engine+'/scripts/local-ci/publish.mjs'],undefined,{timeout:180000,
      env:{...process.env,GH_TOKEN:undefined,GITHUB_TOKEN:undefined,ANTHROPIC_API_KEY:undefined,IMPLEMENTATION_AGENT:workflow.agent,MODEL:implementationIdentity(task).model,GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:String(runId),GITHUB_RUN_ATTEMPT:String(source.run_attempt),
        CANDIDATE_DIRECTORY:workspace,ENGINE_DIRECTORY:engine,FROZEN_DIRECTORY:frozen,ENGINE_SHA:manifest.engineSha}});
    console.log(`Local publisher completed the validated delivery for ${repo}, run ${runId}.`);
  }finally{rmSync(temporary,{recursive:true,force:true});}
}
