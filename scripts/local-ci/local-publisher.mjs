import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {api,run} from './common.mjs';
export async function publishValidatedLocal(repo,runId){
  const deadline=Date.now()+1800000;
  let source,jobs;
  while(Date.now()<deadline){
    source=api(`repos/${repo}/actions/runs/${runId}`);
    jobs=api(`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`).jobs;
    if(source.status==='completed'&&source.conclusion!=='success')throw Error('Workflow failed before local publication.');
    if(jobs.some(job=>job.name==='implementation / validate'&&job.conclusion==='success'))break;
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
  if(source.path!=='.github/workflows/ollama-implementation.yml'||source.head_repository?.full_name!==repo||source.head_branch!==api('repos/'+repo).default_branch)throw Error('Untrusted local publication workflow.');
  if(!jobs.some(job=>job.name==='implementation / validate'&&job.conclusion==='success')||
    !jobs.some(job=>job.name==='implementation / Model patch'&&job.conclusion==='success'))throw Error('Trusted model and validation jobs required.');
  const temporary=mkdtempSync(join(tmpdir(),'validated-local-publisher-'));
  try{
    const frozen=join(temporary,'frozen'),workspace=join(temporary,'candidate');
    run('gh',['run','download',String(runId),'--repo',repo,'--name',`local-frozen-${runId}-${source.run_attempt}`,'--dir',frozen]);
    const manifest=JSON.parse(readFileSync(frozen+'/manifest.json','utf8'));
    if(!source.referenced_workflows?.some(workflow=>workflow.sha===manifest.engineSha&&workflow.path.startsWith('lucasnscr/issue-to-pr-ai/.github/workflows/ollama-reusable.yml@')))throw Error('Reusable workflow provenance missing or divergent.');
    const task=JSON.parse(readFileSync(frozen+'/task.json','utf8'));
    if(task.publishMode!=='local')throw Error('Workflow did not request local publication.');
    const engine=join(temporary,'engine');
    run('git',['clone','--quiet','https://github.com/lucasnscr/issue-to-pr-ai.git',engine]);
    run('git',['checkout','--quiet','--detach',manifest.engineSha],engine);
    run('git',['clone','--quiet','--branch',task.branch,'https://github.com/'+repo+'.git',workspace]);
    run(process.execPath,[engine+'/scripts/local-ci/publish.mjs'],undefined,{timeout:180000,
      env:{...process.env,GH_TOKEN:undefined,GITHUB_TOKEN:undefined,GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:String(runId),GITHUB_RUN_ATTEMPT:String(source.run_attempt),
        CANDIDATE_DIRECTORY:workspace,ENGINE_DIRECTORY:engine,FROZEN_DIRECTORY:frozen,ENGINE_SHA:manifest.engineSha}});
    console.log(`Local publisher completed the validated delivery for ${repo}, run ${runId}.`);
  }finally{rmSync(temporary,{recursive:true,force:true});}
}
