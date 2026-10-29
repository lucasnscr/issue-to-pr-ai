import {targetProfile} from './local-issue-policy.mjs';
export function validateRunnerConfig(config){
  if(config?.version!==1||!/^sentinela-ai-[a-z0-9-]+$/.test(config.baseVm||'')||
    !/^\d+\.\d+\.\d+$/.test(config.runnerVersion||'')||
    config.runnerAsset!==`https://github.com/actions/runner/releases/download/v${config.runnerVersion}/actions-runner-linux-arm64-${config.runnerVersion}.tar.gz`||
    !/^[a-f0-9]{64}$/.test(config.runnerSha256||'')||!Number.isInteger(config.memoryGiB)||!Number.isInteger(config.cpus)||config.memoryGiB<4||config.memoryGiB>16||config.cpus<2||config.cpus>8)throw Error('Invalid pinned runner configuration.');
  return config;
}
export function queuedModelJob(repo,run,jobs,defaultBranch){
  targetProfile(repo);
  if(run.path!=='.github/workflows/ollama-implementation.yml'||run.head_repository?.full_name!==repo||
    run.head_branch!==defaultBranch||!['issue_comment','workflow_dispatch'].includes(run.event)||
    !Number.isSafeInteger(run.id)||run.id<1)return null;
  if(!jobs.some(job=>job.name==='implementation / authorize'&&job.conclusion==='success'))return null;
  return jobs.find(job=>job.status==='queued'&&job.name==='implementation / Model patch'&&
    job.labels?.includes('ollama-local')&&job.labels.includes('run-'+run.id))||null;
}
