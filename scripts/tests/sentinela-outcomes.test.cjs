const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const repo='example/catalog',sha='a'.repeat(40),id=randomUUID(),hash='b'.repeat(64);
const env={SENTINELA_ENABLED:'true',GITHUB_REPOSITORY:repo,SENTINELA_SERVICE:'catalog-api',SENTINELA_ENVIRONMENT:'test',SENTINELA_URL:'http://127.0.0.1:4320',SENTINELA_CALLBACK_TOKEN:'not-a-real-key-contract-token'};
const issue={number:1,body:`<!-- sentinela-sdlc/v1 case=${id} proposal=${hash} -->`};
const pr={number:2,state:'open',merged:false,head:{sha,repo:{full_name:repo}},base:{repo:{full_name:repo}},body:'Closes #1'};
const ci=()=>({workflow_run:{id:10,run_attempt:2,name:'CI',conclusion:'failure',head_sha:sha,repository:{full_name:repo},head_repository:{full_name:repo}}});
const api=async path=>path.includes('/commits/')?[pr]:path.includes('/pulls/')?pr:issue;
test('CI antiga ou fork não envia callback; cancelamento preserva execução',async()=>{
 const {notifyLifecycle}=await import('../sentinela/notify-pr.mjs');const messages=[];const request=async(url,options)=>{messages.push(JSON.parse(options.body));return new Response('{}',{status:202});};
 const event=ci();await notifyLifecycle({env,event,api:async path=>path.includes('/commits/')?[{...pr,head:{...pr.head,sha:'c'.repeat(40)}}]:api(path),request});assert.equal(messages.length,0);
 event.workflow_run.head_repository.full_name='fork/repo';await assert.rejects(notifyLifecycle({env,event,api,request}),/autorizado/);assert.equal(messages.length,0);
 event.workflow_run.head_repository.full_name=repo;event.workflow_run.conclusion='cancelled';await notifyLifecycle({env,event,api,request});assert.equal(messages[0].type,'ci.cancelled');assert.equal(messages[0].runAttempt,2);
});
test('PR fechada sem merge notifica; merge não cancela a entrega',async()=>{
 const {notifyLifecycle}=await import('../sentinela/notify-pr.mjs');let message;const request=async(url,options)=>{message=JSON.parse(options.body);return new Response('{}',{status:202});};
 const event={action:'closed',pull_request:{number:2,head:{sha}}};
 const closed=async path=>path.includes('/pulls/')?{...pr,state:'closed'}:issue;
 await notifyLifecycle({env,event,api:closed,request});assert.equal(message.type,'pull_request.closed');message=null;
 await notifyLifecycle({env,event,api:async path=>path.includes('/pulls/')?{...pr,state:'closed',merged:true}:issue,request});assert.equal(message,null);
});
test('interrupção de implementação exige gate autorizado na branch padrão',async()=>{
 const {notifyLifecycle}=await import('../sentinela/notify-pr.mjs');let calls=0,authorized=false;const event=ci();Object.assign(event.workflow_run,{name:'AI implementation',event:'issue_comment',head_branch:'main',display_title:'AI implementation • issue #1'});event.repository={default_branch:'main'};
 const metadata=async path=>path.includes('/jobs')?{jobs:[{name:'implement',steps:[{name:'Re-authorize and prepare the issue',conclusion:authorized?'success':'skipped'}]}]}:issue;
 const request=async(url,options)=>{calls++;const message=JSON.parse(options.body);assert.equal(message.type,'implementation.failed');assert.equal(message.pullRequestNumber,null);return new Response('{}',{status:202});};
 await notifyLifecycle({env,event,api:metadata,request});assert.equal(calls,0);authorized=true;await notifyLifecycle({env,event,api:metadata,request});assert.equal(calls,1);
 event.workflow_run.head_branch='candidate';await notifyLifecycle({env,event,api:metadata,request});assert.equal(calls,1);
});
