const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('runner pool accepts only the exact authorized queued job on the default branch',async()=>{
 const {queuedModelJob,validateRunnerConfig}=await import('../local-runner-policy.mjs');
 const repo='lucasnscr/sentinela',run={id:42,path:'.github/workflows/ollama-implementation.yml',head_repository:{full_name:repo},head_branch:'main',event:'issue_comment'};
 const jobs=[{name:'implementation / authorize',conclusion:'success'},{name:'implementation / Model patch',status:'queued',labels:['ollama-local','run-42']}];
 assert.ok(queuedModelJob(repo,run,jobs,'main'));
 for(const override of [{head_branch:'feature'},{path:'.github/workflows/untrusted.yml'},{event:'pull_request'},{head_repository:{full_name:'other/repo'}}])assert.equal(queuedModelJob(repo,{...run,...override},jobs,'main'),null);
 assert.equal(queuedModelJob(repo,run,[jobs[1]],'main'),null);
 assert.equal(queuedModelJob(repo,run,[jobs[0],{...jobs[1],labels:['ollama-local']}],'main'),null);
 const config=require('../../config/local-runner.json');validateRunnerConfig(config);
 for(const override of [{runnerAsset:'https://other.example/binary'},{runnerSha256:'unknown'},{memoryGiB:'4'},{baseVm:'personal'}])assert.throws(()=>validateRunnerConfig({...config,...override}));
});
test('frozen task binds repository, attempt, patch and recalculated usage before publication',async()=>{
 const {frozen,hash,validateTask}=await import('../local-ci/common.mjs');
 const env={GITHUB_REPOSITORY:'lucasnscr/issue-to-pr-ai',GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1'};
 const task={repository:env.GITHUB_REPOSITORY,profile:'catalog-java',base:'a'.repeat(40),hash:'b'.repeat(64),issue:1,runId:'42',attempt:'1'};
 validateTask(task,env);assert.throws(()=>validateTask({...task,repository:'lucasnscr/sentinela'},env));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'frozen-test-'));const old={};for(const k of Object.keys(env)){old[k]=process.env[k];process.env[k]=env[k];}
 try{
  const patch='synthetic patch';const usage={runId:'42',attempt:'1',model:'ollama/qwen3-coder:30b',profile:'implementation',outcome:'completed',policy:{decision:'allow'},usage:{complete:true,steps:1,startedSteps:1,invalidUsageEvents:0,policyTokenUnits:100,estimatedCostUsd:0}};
  for(const [name,value] of [['task.json',task],['manifest.json',{runId:'42',attempt:'1',base:task.base,patchHash:hash(patch)}],['ai-usage.json',usage]])fs.writeFileSync(path.join(directory,name),JSON.stringify(value));fs.writeFileSync(path.join(directory,'candidate.patch'),patch);
  assert.equal(frozen(directory).task.issue,1);fs.writeFileSync(path.join(directory,'candidate.patch'),'tampered');assert.throws(()=>frozen(directory));
  fs.writeFileSync(path.join(directory,'candidate.patch'),patch);usage.usage.policyTokenUnits=999999999;fs.writeFileSync(path.join(directory,'ai-usage.json'),JSON.stringify(usage));assert.throws(()=>frozen(directory));
 }finally{for(const k of Object.keys(env)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}fs.rmSync(directory,{recursive:true,force:true});}
});
