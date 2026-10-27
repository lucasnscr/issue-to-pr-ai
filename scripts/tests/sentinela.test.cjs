const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const repo='example/catalog',caseId=randomUUID(),sha='a'.repeat(40),hash='b'.repeat(64);
const env={SENTINELA_ENABLED:'true',SENTINELA_DELIVERY_ENABLED:'true',SENTINELA_URL:'http://127.0.0.1:4320',SENTINELA_CALLBACK_TOKEN:'contract-only-not-a-real-key',GITHUB_REPOSITORY:repo,SENTINELA_SERVICE:'catalog-api',SENTINELA_ENVIRONMENT:'test',SENTINELA_PR_NUMBER:'2',GITHUB_SHA:sha,SENTINELA_DEPLOYMENT_ID:'d1',SENTINELA_ARTIFACT_DIGEST:'sha256:'+'1'.repeat(64)};
function fixture(merged=false){const pr={number:2,state:merged?'closed':'open',merged,merge_commit_sha:sha,head:{sha,repo:{full_name:repo}},base:{repo:{full_name:repo}},body:'Closes #1'};const issue={number:1,body:`<!-- sentinela-sdlc/v1 case=${caseId} proposal=${hash} -->`};return async endpoint=>endpoint.includes('/commits/')?[pr]:endpoint.includes('/pulls/')?pr:endpoint.includes('/issues/')?issue:{status:'identical'};}
test('contrato rejeita versão, marcadores ambíguos e artefato mutável',async()=>{
 const {extractCase,caseMarker,validateEvent}=await import('../../contracts/sdlc-v1.mjs');const marker=caseMarker(caseId,hash);assert.equal(extractCase(marker).caseId,caseId);assert.throws(()=>extractCase(marker+marker),/Ambiguous/);assert.throws(()=>validateEvent({protocol:'unsupported'}));
});
test('notificador recusa CI malsucedida e SHA obsoleto sem enviar o callback',async()=>{
 const {notifyImplementation}=await import('../sentinela/notify-pr.mjs');let calls=0;const request=async()=>{calls++;return new Response('{}',{status:202});};
 const event={workflow_run:{conclusion:'failure',repository:{full_name:repo},head_repository:{full_name:repo},head_sha:sha}};
 await assert.rejects(notifyImplementation({env,api:fixture(),request,event}),/CI/);assert.equal(calls,0);
 event.workflow_run.conclusion='success';await notifyImplementation({env,api:fixture(),request,event});assert.equal(calls,1);
});
test('entrega exige merge humano antes de qualquer mutação e faz rollback quando a verificação falha',async()=>{
 const {deliver}=await import('../sentinela/deliver.mjs');let deploys=0,rollbacks=0;const types=[];
 const deploy=async()=>{deploys++;},rollback=async()=>{rollbacks++;};
 const request=async(url,options)=>{if(options.method==='POST'){types.push(JSON.parse(options.body).type);return new Response('{}',{status:202});}return new Response(JSON.stringify({caseId,repository:repo,issueNumber:1,pullRequestNumber:2,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:'d1',state:types.includes('deployment.rolled_back')?'rolled_back':'regressed'}));};
 await assert.rejects(deliver({env,api:fixture(false),request,deploy,rollback}),/merge/);assert.equal(deploys,0);
 await assert.rejects(deliver({env,api:fixture(true),request,deploy,rollback,verifyOptions:{timeoutMs:100,pollMs:1}}),/rollback/);assert.equal(deploys,1);assert.equal(rollbacks,1);assert.deepEqual(types,['implementation.published','deployment.started','deployment.completed','deployment.rolled_back']);
});
test('verificação de outro deploy e URL remota insegura são recusadas',async()=>{
 const {endpoint,waitForVerification}=await import('../sentinela/client.mjs');assert.throws(()=>endpoint({...env,SENTINELA_URL:'http://remote.example'}),/HTTPS/);
 await assert.rejects(waitForVerification({caseId,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:'d1'},{env,request:async()=>new Response(JSON.stringify({commitSha:sha,artifactDigest:'sha256:'+'2'.repeat(64),deploymentId:'other',state:'verified'})),timeoutMs:100}),/outro deploy/);
});
test('adaptador Kubernetes aplica digest com precondições e não sobrescreve mudança concorrente',async()=>{
 const {kubernetes}=await import('../sentinela/deliver.mjs');const old='ghcr.io/example/catalog@sha256:'+'2'.repeat(64),image='ghcr.io/example/catalog@'+env.SENTINELA_ARTIFACT_DIGEST;
 const settings={...env,SENTINELA_IMAGE:image,SENTINELA_KUBE_CONTEXT:'test',SENTINELA_KUBE_NAMESPACE:'test',SENTINELA_KUBE_DEPLOYMENT:'catalog',SENTINELA_KUBE_CONTAINER:'api'};
 let current=old,version=1,uid='uid-1',patches=0;
 const execute=args=>{if(args.includes('get'))return JSON.stringify({metadata:{uid,resourceVersion:String(version)},spec:{template:{spec:{containers:[{name:'api',image:current}]}}}});if(args.includes('patch')){const patch=JSON.parse(args[args.indexOf('--patch')+1]);assert.ok(patch.some(item=>item.path==='/metadata/uid'&&item.value==='uid-1'));assert.ok(patch.some(item=>item.path==='/metadata/resourceVersion'&&item.value===String(version)));current=patch.at(-1).value;patches++;version++;}return '';};
 const adapter=kubernetes(settings,execute);await adapter.deploy();assert.equal(current,image);await adapter.rollback();assert.equal(current,old);assert.equal(patches,2);
 const stale=kubernetes(settings,execute);uid='replacement';await assert.rejects(stale.deploy(),/mudou/);assert.equal(patches,2);
});

test('entrega reconcilia callback perdido antes do deploy e preserva os SHAs distintos',async()=>{
 const {deliver}=await import('../sentinela/deliver.mjs');const head='b'.repeat(40),types=[];
 const api=async endpoint=>{const result=await fixture(true)(endpoint);if(endpoint.includes('/pulls/'))result.head.sha=head;return result;};
 const request=async(url,options)=>{
  if(options.method==='POST'){const event=JSON.parse(options.body);types.push(event);return new Response('{}',{status:202});}
  return new Response(JSON.stringify({caseId,repository:repo,issueNumber:1,pullRequestNumber:2,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:'d1',state:'verified'}));
 };
 await deliver({env,api,request,deploy:async()=>{assert.equal(types[0].type,'implementation.published');assert.equal(types[0].commitSha,head);},rollback:async()=>assert.fail('rollback inesperado')});
 assert.deepEqual(types.map(item=>item.type),['implementation.published','deployment.started','deployment.completed']);assert.equal(types[1].commitSha,sha);
});

test('pipeline aguarda saúde após rollback e escala falha sem repetir a mutação',async()=>{
 const {deliver}=await import('../sentinela/deliver.mjs');let rollbackCalls=0;const events=[];
 const request=async(url,options)=>{
  if(options.method==='POST'){events.push(JSON.parse(options.body).type);return new Response('{}',{status:202});}
  return new Response(JSON.stringify({caseId,repository:repo,issueNumber:1,pullRequestNumber:2,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:'d1',state:events.includes('deployment.rolled_back')?'rollback_failed':'regressed'}));
 };
 await assert.rejects(deliver({env,api:fixture(true),request,deploy:async()=>{},rollback:async()=>{rollbackCalls++;},verifyOptions:{timeoutMs:100,pollMs:1}}),/escale/);
 assert.equal(rollbackCalls,1);assert.equal(events.at(-1),'deployment.rolled_back');
});
test('falha do comando de rollback é comunicada e não é repetida',async()=>{
 const {deliver}=await import('../sentinela/deliver.mjs');const events=[];let calls=0;
 const request=async(url,options)=>{
  if(options.method==='POST'){events.push(JSON.parse(options.body).type);return new Response('{}',{status:202});}
  return new Response(JSON.stringify({caseId,repository:repo,issueNumber:1,pullRequestNumber:2,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:'d1',state:'regressed'}));
 };
 await assert.rejects(deliver({env,api:fixture(true),request,deploy:async()=>{},rollback:async()=>{calls++;throw new Error('Provider uncertain');}}),/rollback não foi confirmado/);
 assert.equal(calls,1);assert.equal(events.at(-1),'deployment.rollback_failed');
});
