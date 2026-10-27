const {test}=require('node:test');const assert=require('node:assert/strict');const {mkdtemp,readFile,writeFile,rm,symlink,mkdir}=require('node:fs/promises');const {tmpdir}=require('node:os');const path=require('node:path');const {randomUUID}=require('node:crypto');
async function fixture(){const {learningProtocol,digest,learningIdentity}=await import('../../contracts/learning-v1.mjs');const item=learningIdentity({protocol:learningProtocol,caseId:randomUUID(),incidentId:randomUUID(),repository:'example/catalog',service:'catalog-api',environment:'test',commitSha:'a'.repeat(40),version:1,content:{owner:'catalog team',rootCause:'A regressão interrompe a listagem de produtos.',evidenceIds:['log-1'],regression:{profile:'catalog-java-v1',seed:{sku:'REF-1',name:'Reference',price:'10.00'},path:'/api/products',status:200,assertions:[{pointer:'/totalElements',equals:1},{pointer:'/content/0/sku',equals:'REF-1'}]},evaluation:{action:'observe',causeKeywords:['regressão']},runbook:'Conferir evidências e validar o catálogo antes de encerrar o incidente.'}});return {...item,hash:digest(item),state:'approved',approvedAt:new Date().toISOString(),reviewer:'maintainer'};}
test('gerador é determinístico, cria teste executável e recusa sobrescrita ou identidade divergente',async()=>{
 const {generateLearning}=await import('../sentinela/learning.mjs');const root=await mkdtemp(path.join(tmpdir(),'learning-'));try{
  const learning=await fixture(),manifest=await generateLearning(learning,{root,repository:'example/catalog'});assert.deepEqual(await generateLearning(learning,{root,repository:'example/catalog'}),manifest);
  const java=Object.keys(manifest.files).find(file=>file.endsWith('.java'));assert.match(await readFile(path.join(root,java),'utf8'),/Testcontainers/);assert.match(await readFile(path.join(root,java),'utf8'),/decimalValue/);
  await assert.rejects(generateLearning(learning,{root,repository:'other/repo'}),/repository/);
  await writeFile(path.join(root,java),'maintained content');await assert.rejects(generateLearning(learning,{root,repository:'example/catalog'}),/differs/);assert.equal(await readFile(path.join(root,java),'utf8'),'maintained content');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('contrato rejeita código, destino externo e aprovação alterada; rubrica falha em diagnóstico errado',async()=>{
 const {validateLearning,validateContent,evaluateDiagnosis}=await import('../../contracts/learning-v1.mjs');const learning=await fixture();
 assert.throws(()=>validateLearning({...learning,content:{...learning.content,rootCause:'Another reviewed root cause'}}),/hash/);
 assert.throws(()=>validateContent({...learning.content,regression:{...learning.content.regression,path:'https://external.example'}}),/catalog/);
 assert.throws(()=>validateContent({...learning.content,regression:{...learning.content.regression,code:'arbitrary'}}),/fields/);
 assert.equal(evaluateDiagnosis(learning,{action:'rollback',cause:'unknown',hypotheses:[]}).passed,false);
 assert.equal(evaluateDiagnosis(learning,{action:'observe',cause:'Regressão documentada',hypotheses:[{supportingEvidence:['log-1']}]}).passed,true);
});
test('destino symlink é recusado antes da geração',async()=>{
 const {generateLearning}=await import('../sentinela/learning.mjs');const root=await mkdtemp(path.join(tmpdir(),'learning-')),other=await mkdtemp(path.join(tmpdir(),'learning-other-'));try{await symlink(other,path.join(root,'apps'));await assert.rejects(generateLearning(await fixture(),{root,repository:'example/catalog'}),/Symlink/);}finally{await rm(root,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
test('export exige versão/caso/repositório exatos e credencial de callback',async()=>{
 const {fetchLearning}=await import('../sentinela/learning.mjs');const learning=await fixture();const env={GITHUB_REPOSITORY:'example/catalog',SENTINELA_URL:'http://127.0.0.1:4320',SENTINELA_CALLBACK_TOKEN:'not-a-real-key-contract-token'};
 const request=async url=>{assert.equal(new URL(url).pathname,`/api/sdlc/cases/${learning.caseId}/learning`);return new Response(JSON.stringify(learning));};
 assert.equal((await fetchLearning(learning.caseId,1,{env,request})).hash,learning.hash);
 await assert.rejects(fetchLearning(randomUUID(),1,{env,request:async()=>new Response(JSON.stringify(learning))}),/identity/);
 await assert.rejects(fetchLearning(learning.caseId,1,{env:{...env,SENTINELA_CALLBACK_TOKEN:''},request}),/credential/);
});
test('issue de aprendizado exige marcador único e export aprovado com o mesmo hash',async()=>{
 const {prepareLearningIssue,learningMarker}=await import('../sentinela/learning-issue.mjs');const learning=await fixture(),marker=`<!-- sentinela-learning/v1 version=1 case=${learning.caseId} proposal=${learning.hash} -->`;
 assert.throws(()=>learningMarker(marker+marker),/Ambiguous/);
 const env={GITHUB_REPOSITORY:'example/catalog',SENTINELA_URL:'http://127.0.0.1:4320',SENTINELA_CALLBACK_TOKEN:'not-a-real-key-contract-token'},api=async()=>({body:marker}),request=async()=>new Response(JSON.stringify(learning));
 assert.equal((await prepareLearningIssue(1,{env,api,request})).hash,learning.hash);
 await assert.rejects(prepareLearningIssue(1,{env,api:async()=>({body:marker.replace(learning.hash,'c'.repeat(64))}),request}),/hash changed/);
});
test('publisher regenera somente artefatos aprovados e abre PR draft com CI explícita',async()=>{
 const {publishLearningPr}=await import('../sentinela/publish-learning.mjs'),{generateLearning}=await import('../sentinela/learning.mjs');const root=await mkdtemp(path.join(tmpdir(),'learning-publish-'));try{
  await mkdir(path.join(root,'.git'));const learning=await fixture(),manifest=await generateLearning(learning,{root,repository:'example/catalog'}),calls=[];
  const files=[...Object.keys(manifest.files),`evaluations/incidents/${learning.caseId}/manifest-v1.json`];
  const execute=(program,args)=>{calls.push([program,...args]);if(program==='gh'&&args[0]==='pr'&&args[1]==='list')return '[]';if(args[0]==='diff')return files.join('\n');if(program==='gh'&&args[0]==='pr'&&args[1]==='create'){assert.ok(args.includes('--draft'));return 'https://github.com/example/catalog/pull/3';}return '';};
  assert.equal(await publishLearningPr(learning,{root,repository:'example/catalog',issueNumber:1,execute}),'https://github.com/example/catalog/pull/3');
  assert.ok(calls.some(call=>call.includes('ci.yml')));assert.ok(calls.every(call=>['gh','git'].includes(call[0])));
  await assert.rejects(publishLearningPr(learning,{root,repository:'other/repo',issueNumber:1,execute}),/identity/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('workflow separa callback, testes e publicação e permanece desabilitado por padrão',async()=>{
 const yaml=await readFile(path.join(__dirname,'../../.github/workflows/sentinela-learning.yml'),'utf8');assert.match(yaml,/SENTINELA_LEARNING_ENABLED == 'true'/);assert.equal((yaml.match(/SENTINELA_CALLBACK_TOKEN:/g)||[]).length,1);assert.ok(!yaml.split('  validate:')[1].includes('SENTINELA_CALLBACK_TOKEN'));assert.match(yaml,/needs: \[prepare, validate\]/);assert.match(yaml,/persist-credentials: false/);
});
