import {realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {extractCase,eventId} from '../../contracts/sdlc-v1.mjs';
import {changeContext,githubApi} from './github.mjs';
import {sendEvent,waitForVerification,verificationTimeout} from './client.mjs';
export async function deliver({env=process.env,api=githubApi,request=fetch,deploy,rollback,verifyOptions={}}={}){
  if(env.SENTINELA_DELIVERY_ENABLED!=='true')throw new Error('Entrega Sentinela não habilitada.');
  verificationTimeout(env);
  const repo=env.GITHUB_REPOSITORY,sha=env.GITHUB_SHA;
  const {pr,issue}=await changeContext({repo,prNumber:Number(env.SENTINELA_PR_NUMBER),commitSha:sha,requireMerged:true},api);
  const marker=extractCase(issue.body);if(!marker)throw new Error('Issue não está vinculada a um caso Sentinela.');
  const context={...marker,repository:repo,service:env.SENTINELA_SERVICE,environment:env.SENTINELA_ENVIRONMENT,issueNumber:issue.number,pullRequestNumber:pr.number,commitSha:sha,artifactDigest:env.SENTINELA_ARTIFACT_DIGEST,deploymentId:env.SENTINELA_DEPLOYMENT_ID};
  const message=type=>({...context,type,id:eventId(type,marker.caseId,context.deploymentId),at:new Date().toISOString()});
  const run=type=>sendEvent(message(type),{env,request});
  // A successful release build can reconcile a CI callback lost before merge.
  // Use the PR head here; the deployment separately identifies the integrated SHA.
  await sendEvent({...context,type:'implementation.published',commitSha:pr.head.sha,
    id:eventId('implementation.published',marker.caseId,pr.head.sha),at:new Date().toISOString()},{env,request});
  const start=await run('deployment.started');
  if(start.caseId!==context.caseId||start.state!=='deploying'||start.replayed!==false||start.currentAttempt!==true)throw new Error('Início não é novo nem pertence à tentativa atual; confira o deploy antes de executar.');
  try{
    await deploy(context);await run('deployment.completed');
    return await waitForVerification({...context},{env,request,...verifyOptions});
  }catch{
    try{await rollback(context);await run('deployment.rolled_back');}
    catch{await run('deployment.rollback_failed');throw new Error('Entrega falhou e rollback não foi confirmado. Confira o ambiente.');}
    try{await waitForVerification({...context},{env,request,...verifyOptions,goal:'rollback'});}
    catch{throw new Error('Saúde após rollback não confirmada; escale para intervenção humana.');}
    throw new Error('Entrega sem recuperação confirmada; saúde recuperada após rollback verificado.');
  }
}
export function kubernetes(env,execute=args=>execFileSync('kubectl',args,{encoding:'utf8',timeout:180000,maxBuffer:1_000_000,stdio:['ignore','pipe','pipe']})){
  for(const key of ['SENTINELA_KUBE_CONTEXT','SENTINELA_KUBE_NAMESPACE','SENTINELA_KUBE_DEPLOYMENT','SENTINELA_KUBE_CONTAINER'])if(!/^[A-Za-z0-9_.:/@-]{1,200}$/.test(env[key]||''))throw new Error('Alvo Kubernetes explícito obrigatório: '+key);
  const image=env.SENTINELA_IMAGE;if(!/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(image||'')||!image.endsWith('@'+env.SENTINELA_ARTIFACT_DIGEST))throw new Error('Imagem deve usar o digest validado.');
  const prefix=['--context',env.SENTINELA_KUBE_CONTEXT,'--namespace',env.SENTINELA_KUBE_NAMESPACE,'--request-timeout=30s'];
  const kube=args=>execute([...prefix,...args]);
  const deployment=JSON.parse(kube(['get','deployment/'+env.SENTINELA_KUBE_DEPLOYMENT,'-o','json']));
  const container=deployment.spec?.template?.spec?.containers?.find(item=>item.name===env.SENTINELA_KUBE_CONTAINER);if(!container)throw new Error('Container não encontrado.');
  const previous=container.image,uid=deployment.metadata.uid;
  if(!/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(previous||''))throw new Error('O rollback exige que a imagem anterior também esteja fixada por digest.');
  const apply=(value,expected)=>{
    const live=JSON.parse(kube(['get','deployment/'+env.SENTINELA_KUBE_DEPLOYMENT,'-o','json']));
    const index=live.spec.template.spec.containers.findIndex(item=>item.name===env.SENTINELA_KUBE_CONTAINER);
    if(live.metadata.uid!==uid||index<0||live.spec.template.spec.containers[index].image!==expected)throw new Error('O alvo mudou; ajuste não aplicado.');
    const patch=[{op:'test',path:'/metadata/resourceVersion',value:live.metadata.resourceVersion},{op:'test',path:'/metadata/uid',value:uid},{op:'test',path:'/spec/template/spec/containers/'+index+'/image',value:expected},{op:'replace',path:'/spec/template/spec/containers/'+index+'/image',value}];
    kube(['patch','deployment/'+env.SENTINELA_KUBE_DEPLOYMENT,'--type=json','--patch',JSON.stringify(patch),'-o','name']);kube(['rollout','status','deployment/'+env.SENTINELA_KUBE_DEPLOYMENT,'--timeout=150s']);
  };
  return {deploy:async()=>apply(image,previous),rollback:async()=>apply(previous,image)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  const adapters=kubernetes(process.env);await deliver({...adapters});console.log('Entrega e recuperação verificadas pelo Sentinela.');
}
