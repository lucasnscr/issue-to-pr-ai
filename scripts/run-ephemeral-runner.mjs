import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {validateRunnerConfig,queuedModelJob} from './local-runner-policy.mjs';
import {targetProfile,verifyVm} from './local-issue-policy.mjs';
import {publishValidatedLocal} from './local-ci/local-publisher.mjs';
const root=new URL('../',import.meta.url).pathname;
const config=validateRunnerConfig(JSON.parse(readFileSync(join(root,'config/local-runner.json'),'utf8')));
if(process.argv.slice(2).some(arg=>arg!=='--watch'&&!/^--(repos|max-jobs)=.+$/.test(arg)))throw Error('Unknown runner option.');
const repos=(process.argv.find(arg=>arg.startsWith('--repos='))?.slice(8)||'lucasnscr/issue-to-pr-ai,lucasnscr/sentinela').split(',');
for(const repo of repos)targetProfile(repo);
const watch=process.argv.includes('--watch');
const max=Number(process.argv.find(arg=>arg.startsWith('--max-jobs='))?.slice(11)||1);
if(!Number.isSafeInteger(max)||max<1||max>100)throw Error('Use --max-jobs=1..100.');
const call=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:10485760,...options});
const api=(path,method)=>JSON.parse(call('gh',['api',path,...(method?['--method',method]:[])]));
const lock=join(tmpdir(),'sentinela-ai-runner-pool.lock');
mkdirSync(lock);writeFileSync(join(lock,'owner'),String(process.pid));
let stopping=false,activeVm=null,activeRepo=null,activeRunnerId=null,listener=null;
process.on('SIGTERM',()=>{stopping=true;listener?.kill('SIGTERM');});
process.on('SIGINT',()=>{stopping=true;listener?.kill('SIGTERM');});
const guest=(...args)=>call('limactl',['shell',activeVm,'--',...args],{timeout:300000});
const copy=(from,to)=>call('limactl',['copy',from,activeVm+':'+to]);
function record(value){mkdirSync(join(root,'artifacts'),{recursive:true});appendFileSync(join(root,'artifacts/ephemeral-runners.jsonl'),JSON.stringify({...value,at:new Date().toISOString()})+'\n');}
async function candidate(){
  for(const repo of repos){
    const branch=api('repos/'+repo).default_branch;
    const runs=api(`repos/${repo}/actions/workflows/ollama-implementation.yml/runs?per_page=10`).workflow_runs||[];
    for(const run of runs.filter(item=>['queued','in_progress'].includes(item.status)).sort((a,b)=>a.id-b.id)){
      const jobs=api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs||[];
      if(queuedModelJob(repo,run,jobs,branch))return {repo,run};
    }
  }
  return null;
}
async function executeJob({repo,run}){
  const suffix=randomUUID().slice(0,8);activeVm='sentinela-ai-job-'+suffix;activeRepo=repo;
  const base=JSON.parse(call('limactl',['list',config.baseVm,'--json']));
  if(!base.config||base.config.mounts?.length||base.config.ssh?.forwardAgent)throw Error('Base VM shares host data or lacks resolved configuration.');
  if(base.status==='Running')call('limactl',['stop',config.baseVm],{timeout:120000});
  call('limactl',['clone',config.baseVm,activeVm,'--mount-none','--cpus',String(config.cpus),'--memory',String(config.memoryGiB),'--start','--tty=false'],{timeout:300000});
  verifyVm(JSON.parse(call('limactl',['list',activeVm,'--json'])),activeVm);
  guest('sh','-c','command -v gh >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y gh; }');
  guest('docker','info','--format','{{.ServerVersion}}');
  guest('node','-e',"require('fs').rmSync('/tmp/sentinela-runner-dist/.credentials',{force:true})");
  // Release bytes are verified on the host and guest before executing the runner.
  const archive=join(root,'.tools/runner/actions-runner-linux-arm64-'+config.runnerVersion+'.tar.gz');
  mkdirSync(join(root,'.tools/runner'),{recursive:true});
  if(!existsSync(archive))call('curl',['--fail','--location','--silent','--show-error',config.runnerAsset,'-o',archive],{timeout:300000});
  if(createHash('sha256').update(readFileSync(archive)).digest('hex')!==config.runnerSha256)throw Error('Runner release checksum mismatch.');
  guest('mkdir','-p','/tmp/local-runner');copy(archive,'/tmp/local-runner/runner.tar.gz');
  guest('sh','-c','cd /tmp/local-runner && echo "$1  runner.tar.gz" | sha256sum -c - && tar -xzf runner.tar.gz','sh',config.runnerSha256);
  const secret=randomBytes(32).toString('hex');
  call('limactl',['shell',activeVm,'--','sh','-c','umask 077; cat > /tmp/sentinela-gateway-token'],{input:secret});
  copy(join(root,'scripts/ollama-loopback-proxy.mjs'),'/tmp/ollama-proxy.mjs');
  guest('sh','-c','export OLLAMA_GATEWAY_TOKEN="$(cat /tmp/sentinela-gateway-token)"; nohup node /tmp/ollama-proxy.mjs > /tmp/ollama-gateway.log 2>&1 &');
  guest('node','-e',`(async()=>{for(let n=0;n<20;n++){try{const r=await fetch('http://127.0.0.1:11434/api/version');if(r.status!==401)process.exit(1);return;}catch{await new Promise(r=>setTimeout(r,100));}}process.exit(1)})()`);
  const registration=api(`repos/${repo}/actions/runners/registration-token`,'POST');
  call('limactl',['shell',activeVm,'--','sh','-c','umask 077; cat > /tmp/runner-registration'],{input:registration.token});
  guest('sh','-c','cd /tmp/local-runner && ./config.sh --unattended --url "$1" --token "$(cat /tmp/runner-registration)" --name "$2" --labels "$3" --ephemeral --disableupdate --work /tmp/runner-work && rm /tmp/runner-registration',
    'sh','https://github.com/'+repo,activeVm,'ollama-local,run-'+run.id);
  activeRunnerId=api(`repos/${repo}/actions/runners?per_page=100`).runners.find(r=>r.name===activeVm)?.id;
  console.log(`Ephemeral runner started for ${repo}, run ${run.id}; no shared host mounts.`);
  record({type:'started',repo,runId:run.id,vm:activeVm,runnerId:activeRunnerId,gatewayUnauthorizedRejected:true,hostMounts:0});
  const exit=await new Promise((resolve,reject)=>{
    listener=spawn('limactl',['shell',activeVm,'--','sh','-c','cd /tmp/local-runner && ./run.sh'],{stdio:['ignore','pipe','pipe']});
    // Runner diagnostics stay local; never relay credentials or raw job output.
    listener.stdout.on('data',()=>{});listener.stderr.on('data',()=>{});
    const timer=setTimeout(()=>listener.kill('SIGTERM'),1800000);
    listener.on('error',reject);listener.on('close',code=>{clearTimeout(timer);resolve(code);});
  });
  if(exit!==0&&!stopping)throw Error('Ephemeral runner did not finish cleanly.');
  console.log(`Ephemeral model job completed for ${repo}, run ${run.id}. Validation/publication use separate hosted jobs.`);
}
async function cleanup(){
  if(activeRepo&&activeVm){
    const registrations=api(`repos/${activeRepo}/actions/runners?per_page=100`).runners.filter(r=>r.name===activeVm);
    for(const runner of registrations){call('gh',['api',`repos/${activeRepo}/actions/runners/${runner.id}`,'--method','DELETE']);}
    if(api(`repos/${activeRepo}/actions/runners?per_page=100`).runners.some(r=>r.name===activeVm))throw Error('Runner registration cleanup failed.');
  }
  if(activeVm){
    let exists=false;try{exists=Boolean(JSON.parse(call('limactl',['list',activeVm,'--json'])).name);}catch{}
    if(exists){call('limactl',['delete','--force',activeVm,'--tty=false'],{timeout:120000});}
    const remaining=call('limactl',['list','--json']).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    if(remaining.some(vm=>vm.name===activeVm))throw Error('Ephemeral VM cleanup failed; operator attention required.');
    record({type:'destroyed',repo:activeRepo,vm:activeVm,registrationRemoved:true,vmRemoved:true});
  }
  activeVm=null;activeRepo=null;activeRunnerId=null;listener=null;
}
try{
  let count=0;
  while(!stopping&&count<max){
    let job;try{job=await candidate();}catch(error){if(!watch)throw error;}
    if(!job){if(!watch)throw Error('No authorized model job is queued.');await new Promise(resolve=>setTimeout(resolve,15000));continue;}
    try{await executeJob(job);count++;}finally{await cleanup();}
    if(job.repo==='lucasnscr/sentinela')await publishValidatedLocal(job.repo,job.run.id);
  }
}finally{try{await cleanup();}finally{rmSync(lock,{recursive:true,force:true});}}
