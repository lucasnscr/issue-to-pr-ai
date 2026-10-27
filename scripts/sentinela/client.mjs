import {protocol,validateEvent} from '../../contracts/sdlc-v1.mjs';
export function endpoint(env=process.env){
  let base;try{base=new URL(env.SENTINELA_URL||'');}catch{throw new Error('Configure SENTINELA_URL.');}
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.protocol==='https:'||base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new Error('SENTINELA_URL exige origem HTTPS ou loopback HTTP, sem credenciais.');
  if(!env.SENTINELA_CALLBACK_TOKEN||env.SENTINELA_CALLBACK_TOKEN.length<24)throw new Error('Configure SENTINELA_CALLBACK_TOKEN com pelo menos 24 caracteres.');
  return base;
}
export async function sendEvent(input,{env=process.env,request=fetch}={}){
  const message=validateEvent({...input,protocol}),base=endpoint(env);
  let response;try{response=await request(new URL('/api/sdlc/events',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.SENTINELA_CALLBACK_TOKEN,'content-type':'application/json'},body:JSON.stringify(message)});}catch{throw new Error('Callback SDLC não confirmado. Reenvie o mesmo evento após conferir a conectividade.');}
  if(response.status!==202)throw new Error('Sentinela recusou o evento SDLC: HTTP '+response.status);
  return response.json();
}
export async function waitForVerification(expected,{env=process.env,request=fetch,timeoutMs=360000,pollMs=3000,goal='correction'}={}){
  if(!['correction','rollback'].includes(goal))throw new Error('Objetivo de verificação inválido.');
  const base=endpoint(env),deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const response=await request(new URL('/api/sdlc/cases/'+expected.caseId,base),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+env.SENTINELA_CALLBACK_TOKEN}});
    if(!response.ok)throw new Error('Não foi possível consultar a verificação SDLC: HTTP '+response.status);
    const item=await response.json();
    if(item.caseId!==expected.caseId||item.commitSha!==expected.commitSha||item.artifactDigest!==expected.artifactDigest||item.deploymentId!==expected.deploymentId||['repository','issueNumber','pullRequestNumber'].some(key=>expected[key]!==undefined&&item[key]!==expected[key]))throw new Error('A verificação pertence a outro deploy.');
    if(item.state===(goal==='rollback'?'rolled_back':'verified'))return item;
    if(goal==='rollback'?item.state==='rollback_failed':['regressed','rollback_verifying','rolled_back','rollback_failed'].includes(item.state))throw new Error('Deploy/rollback sem recuperação confirmada.');
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw new Error('Tempo de verificação operacional excedido.');
}
