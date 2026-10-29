const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const env={GITHUB_REPOSITORY:'lucasnscr/sentinela',GITHUB_EVENT_NAME:'issue_comment',GITHUB_REF:'refs/heads/main',
 GITHUB_ACTOR:'maintainer',GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'2',IMPLEMENTATION_AGENT:'claude',MODEL:'anthropic/claude-sonnet-4-6',PUBLISH_MODE:'local'};
const event={repository:{default_branch:'main'},issue:{number:25},comment:{body:'@claude implemente',user:{type:'User',login:'maintainer'}}};
const issue={number:25,title:'Regression',body:'Preserve embeddings when diagnosis format is invalid.',state:'open',labels:[{name:'ai:ready'}]};
const api=(permission='write',current=issue)=>p=>p.endsWith('/permission')?{permission}:p.includes('/issues/')?current:{sha:'a'.repeat(40)};
test('@claude selects only the Claude path and keeps /oc exclusive to OpenCode',async()=>{
 const {matchesImplementationCommand,implementationIdentity}=await import('../local-ci/agent-identity.mjs');
 for(const text of ['@claude','  @Claude implement']){assert.ok(matchesImplementationCommand(text,'claude'));assert.equal(matchesImplementationCommand(text,'opencode'),false);}
 for(const text of ['/oc','/opencode implement']){assert.ok(matchesImplementationCommand(text,'opencode'));assert.equal(matchesImplementationCommand(text,'claude'),false);}
 for(const text of ['please @claude','@claudee','/ocmalicious','@claude-malicious',''])assert.equal(matchesImplementationCommand(text,'claude'),false);
 assert.deepEqual(implementationIdentity(),{agent:'opencode',model:'ollama/qwen3-coder:30b'});
 for(const task of [{agent:'claude',model:'ollama/qwen3-coder:30b'},{agent:'claude',model:'anthropic/unapproved'},{agent:'unknown',model:env.MODEL}])assert.throws(()=>implementationIdentity(task));
});
test('Claude authorization requires a current human issue, write access and reviewed default branch',async()=>{
 const {authorizeEvent}=await import('../local-ci/authorize-event.mjs');
 const call=(e=env,v=event,request=api())=>authorizeEvent({env:e,event:v,request});
 const task=call();assert.equal(task.profile,'sentinela-typescript');assert.equal(task.agent,'claude');assert.equal(task.model,env.MODEL);assert.equal(task.publishMode,'local');
 for(const permission of ['read','none'])assert.throws(()=>call(env,event,api(permission)),/Write permission/);
 for(const current of [{...issue,labels:[]},{...issue,state:'closed'},{...issue,pull_request:{}},{...issue,body:''}])assert.throws(()=>call(env,event,api('write',current)),/authorized issue/);
 for(const override of [{GITHUB_REF:'refs/heads/fork'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'attacker/repo'}])assert.throws(()=>call({...env,...override}));
 for(const user of [{type:'Bot',login:'maintainer'},{type:'User',login:'someone-else'}])assert.throws(()=>call(env,{...event,comment:{...event.comment,user}}),/human/);
 assert.equal(call(env,{...event,comment:{...event.comment,body:'/oc implement'}}),null);
 assert.throws(()=>call({...env,MODEL:'anthropic/unapproved'}));
});
test('controlled Claude profile has TypeScript instructions, no shell or discovered candidate configuration',async()=>{
 const {claudeArguments}=await import('../run-implementation.mjs');
 const args=claudeArguments({taskFile:'/task.md',model:env.MODEL,profile:{maxSteps:35,maxEstimatedCostUsd:5},
  rules:'NEXT_GUIDES_REQUIRED',implementationProfileName:'sentinela-typescript',taskContent:'UNTRUSTED_ACCEPTANCE'});
 const value=k=>args[args.indexOf(k)+1];
 assert.equal(value('--tools'),'Read,Edit,Write,Glob,Grep');assert.ok(!value('--allowedTools').includes('Bash'));
 assert.match(value('-p'),/Next\.js guide/);assert.match(value('-p'),/UNTRUSTED_ACCEPTANCE/);assert.doesNotMatch(value('-p'),/\.\/mvnw/);
 assert.equal(value('--setting-sources'),'');assert.ok(args.includes('--bare'));assert.equal(value('--permission-prompts'),'none');
 const settings=JSON.parse(value('--settings'));assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories,true);assert.ok(settings.permissions.deny.includes('Bash'));
 assert.ok(settings.permissions.deny.includes('Read(//proc/**)'));assert.ok(!args.includes('--dangerously-skip-permissions'));
});
test('Claude generation container has only provider credentials and no host/docker publication capability',async()=>{
 const {claudeContainerArguments}=await import('../local-ci/generate-claude.mjs');
 const args=claudeContainerArguments({workspace:'/candidate',engine:'/engine',output:'/frozen',taskDirectory:'/task',task:{agent:'claude',model:env.MODEL,profile:'sentinela-typescript',runId:'42',attempt:'2'}});
 assert.ok(args.includes('--read-only'));assert.ok(args.includes('--cap-drop=ALL'));assert.ok(args.includes('ANTHROPIC_API_KEY'));
 assert.ok(args.includes('/engine:/engine:ro'));assert.ok(args.includes('/task/task.md:/task.md:ro'));
 for(const denied of ['GITHUB_TOKEN','GH_TOKEN','docker.sock','OLLAMA_API_KEY','FAKE_SECRET'])assert.ok(!args.join(' ').includes(denied));
});
test('frozen Claude results reject changed agent/model, missing usage and overrun before independent validation',async()=>{
 const {frozen,hash}=await import('../local-ci/common.mjs');const {authorizeEvent}=await import('../local-ci/authorize-event.mjs');
 const task=authorizeEvent({env,event,request:api()}),directory=fs.mkdtempSync(path.join(os.tmpdir(),'frozen-claude-'));
 const patch='bounded synthetic patch',manifest={runId:'42',attempt:'2',base:task.base,patchHash:hash(patch),agent:'claude',model:env.MODEL};
 const usage={agent:'claude',runId:'42',attempt:'2',model:env.MODEL,profile:'implementation',outcome:'completed',policy:{decision:'allow'},
  usage:{complete:true,steps:2,startedSteps:2,invalidUsageEvents:0,policyTokenUnits:100,estimatedCostUsd:0.01}};
 const write=(t=task,m=manifest,u=usage,p=patch)=>{for(const [file,value] of [['task.json',t],['manifest.json',m],['ai-usage.json',u]])fs.writeFileSync(path.join(directory,file),JSON.stringify(value));fs.writeFileSync(path.join(directory,'candidate.patch'),p);};
 try{
  write();assert.equal(frozen(directory,env).task.agent,'claude');
  for(const [t,m,u,p] of [[task,{...manifest,agent:'opencode'},usage,patch],[task,manifest,{...usage,agent:'opencode'},patch],
   [task,manifest,{...usage,model:'ollama/qwen3-coder:30b'},patch],[task,manifest,{...usage,usage:{...usage.usage,complete:false}},patch],
   [task,manifest,{...usage,usage:{...usage.usage,policyTokenUnits:2e6}},patch],[task,manifest,usage,'tampered'],
   [{...task,model:'anthropic/unapproved'},manifest,usage,patch],[{...task,attempt:'1'},manifest,usage,patch]]){
    write(t,m,u,p);assert.throws(()=>frozen(directory,env));
   }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('cloud publication requires trusted workflow and authorization, without a local inference runner',async()=>{
 const {queuedCloudPublication,queuedModelJob}=await import('../local-runner-policy.mjs');
 const {publicationWorkflow}=await import('../local-ci/agent-identity.mjs');
 const run={id:42,path:'.github/workflows/claude-implementation.yml',head_repository:{full_name:env.GITHUB_REPOSITORY},head_branch:'main',event:'issue_comment'};
 const jobs=[{name:'implementation / authorize',conclusion:'success'},{name:'implementation / Model patch',status:'in_progress',labels:['ubuntu-latest']}];
 assert.ok(queuedCloudPublication(env.GITHUB_REPOSITORY,run,jobs,'main'));assert.equal(queuedModelJob(env.GITHUB_REPOSITORY,run,jobs,'main'),null);
 for(const override of [{path:'.github/workflows/other.yml'},{head_branch:'fork'},{event:'pull_request'},{head_repository:{full_name:'attacker/repo'}}])assert.equal(queuedCloudPublication(env.GITHUB_REPOSITORY,{...run,...override},jobs,'main'),null);
 assert.equal(queuedCloudPublication(env.GITHUB_REPOSITORY,run,[jobs[1]],'main'),null);
 assert.equal(queuedCloudPublication(env.GITHUB_REPOSITORY,run,[jobs[0],{...jobs[1],conclusion:'cancelled'}],'main'),null);
 assert.equal(publicationWorkflow(run.path).reusable,'claude-reusable.yml');assert.throws(()=>publicationWorkflow('.github/workflows/other.yml'));
});
test('stopped local publisher performs no GitHub lookup or publication',async()=>{
 const {publishValidatedLocal}=await import('../local-ci/local-publisher.mjs');
 await assert.rejects(publishValidatedLocal(env.GITHUB_REPOSITORY,42,{signal:AbortSignal.abort()}),/abort/i);
});
test('Claude generation freezes the authorized TypeScript patch and rejects a candidate outside scope',async()=>{
 const {execFileSync}=require('node:child_process');
 const {generateClaude}=await import('../local-ci/generate-claude.mjs');
 const {authorizeEvent}=await import('../local-ci/authorize-event.mjs');
 const {frozen}=await import('../local-ci/common.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-generation-'));
 const workspace=path.join(root,'candidate'),output=path.join(root,'frozen'),taskDirectory=path.join(root,'task');
 const git=(...args)=>execFileSync('git',args,{cwd:workspace,encoding:'utf8'});
 try{
  fs.mkdirSync(workspace);fs.mkdirSync(taskDirectory);git('init','-q');git('config','user.name','test');git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(workspace,'AGENTS.md'),'Trusted rules');
  git('add','AGENTS.md');git('-c','core.hooksPath=/dev/null','commit','-qm','base');
  const task={...authorizeEvent({env,event,request:api()}),base:git('rev-parse','HEAD').trim()};
  fs.writeFileSync(path.join(taskDirectory,'task.json'),JSON.stringify(task));fs.writeFileSync(path.join(taskDirectory,'task.md'),'Acceptance');
  const generationEnv={...env,CANDIDATE_DIRECTORY:workspace,ENGINE_DIRECTORY:process.cwd(),FROZEN_DIRECTORY:output,TASK_DIRECTORY:taskDirectory,
   ENGINE_SHA:'b'.repeat(40),ANTHROPIC_API_KEY:'synthetic-provider-key',PATH:process.env.PATH};
  let invalid=false;const calls=[];
  const execute=(command,args,cwd)=>{
   calls.push([command,...args]);
   if(command==='git')return execFileSync(command,args,{cwd,encoding:'utf8'});
   assert.equal(command,'docker');
   if(args[0]==='run'){
    fs.mkdirSync(path.join(workspace,'lib'),{recursive:true});fs.mkdirSync(path.join(workspace,'tests'),{recursive:true});
    fs.writeFileSync(path.join(workspace,'lib/regression.ts'),'export const result = 1;\n');
    fs.writeFileSync(path.join(workspace,'tests/regression.test.ts'),'// controlled regression fixture\n');
    if(invalid)fs.writeFileSync(path.join(workspace,'package.json'),'{}');
    fs.writeFileSync(path.join(output,'ai-usage.json'),JSON.stringify({agent:'claude',runId:'42',attempt:'2',model:env.MODEL,profile:'implementation',
     outcome:'completed',policy:{decision:'allow'},usage:{complete:true,steps:2,startedSteps:2,invalidUsageEvents:0,policyTokenUnits:100,estimatedCostUsd:0.01}}));
   }
   return '';
  };
  generateClaude({env:generationEnv,execute});
  const result=frozen(output,env);assert.equal(result.manifest.engineSha,generationEnv.ENGINE_SHA);
  assert.match(result.patch.toString(),/lib\/regression.ts/);assert.match(result.patch.toString(),/tests\/regression.test.ts/);
  assert.equal(calls.filter(call=>call[1]==='rm').length,1);
  invalid=true;assert.throws(()=>generateClaude({env:generationEnv,execute}),/outside the task scope/);
  assert.equal(calls.filter(call=>call[1]==='rm').length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
