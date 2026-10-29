import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {run,hash,validateTask} from './common.mjs';
import {validateChanges} from '../validate-agent-changes.mjs';
import {implementationProvider} from '../model-provider.mjs';
import {preflight} from '../ollama-preflight.mjs';
const env=process.env,workspace=resolve(env.CANDIDATE_DIRECTORY),engine=resolve(env.ENGINE_DIRECTORY),output=resolve(env.FROZEN_DIRECTORY);
const task=validateTask(JSON.parse(readFileSync(env.TASK_DIRECTORY+'/task.json','utf8')));
if(run('git',['rev-parse','HEAD'],workspace).trim()!==task.base)throw Error('Candidate checkout differs from the authorized base.');
const key=readFileSync('/tmp/sentinela-gateway-token','utf8').trim();
if(!/^[a-f0-9]{64}$/.test(key))throw Error('Authenticated local inference gateway unavailable.');
const provider=implementationProvider({MODEL:'ollama/qwen3-coder:30b',OLLAMA_API_KEY:key});
const native=await preflight({apiKey:key});
mkdirSync(output,{recursive:true});
const config={...JSON.parse(provider.env.OPENCODE_CONFIG_CONTENT),$schema:'https://opencode.ai/config.json',plugin:[],mcp:{},formatter:false,lsp:false,
  instructions:['/workspace/AGENTS.md'],permission:{'*':'deny',read:'allow',glob:'allow',grep:'allow',edit:'allow',bash:'deny',external_directory:'deny'},
  agent:{'live-implementer':{mode:'primary',steps:35,temperature:0,permission:{bash:'deny'}}}};
writeFileSync(output+'/control.json',JSON.stringify(config));
run('docker',['build','-t','issue-to-pr-opencode:1.19.3',engine+'/infra/agents'],undefined,{timeout:300000});
const name='sentinela-model-'+task.runId+'-'+task.attempt;
try{
  run('docker',['run','--rm','--name',name,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=2g','--cpus=2','--network=host',
    '--user',`${process.getuid()}:${process.getgid()}`,'--tmpfs','/tmp:rw,exec,size=1g,mode=1777',
    '-v',workspace+':/workspace:rw','-v',engine+':/engine:ro','-v',resolve(env.TASK_DIRECTORY)+'/task.md:/task.md:ro',
    '-v',output+':/artifacts:rw','-v',output+'/control.json:/control/opencode.json:ro',
    '-e','OPENCODE_CONFIG=/control/opencode.json','-e','MODEL=ollama/qwen3-coder:30b','-e','OLLAMA_API_KEY',
    '-e','TASK_FILE=/task.md','-e','IMPLEMENTATION_PROFILE='+task.profile,'-e','AI_USAGE_FILE=/artifacts/ai-usage.json',
    '-e','AI_SUMMARY_FILE=/artifacts/implementation-summary.md','-e','GITHUB_RUN_ID='+task.runId,'-e','GITHUB_RUN_ATTEMPT='+task.attempt,
    '--entrypoint','node','issue-to-pr-opencode:1.19.3','/engine/scripts/run-implementation.mjs'],undefined,
    {timeout:1000000,env:{PATH:env.PATH,HOME:env.HOME,OLLAMA_API_KEY:key}});
  const files=validateChanges(workspace,task.base,task.profile);run('git',['add','--',...files],workspace);
  const patch=run('git',['diff','--cached','--binary'],workspace);
  writeFileSync(output+'/candidate.patch',patch);copyFileSync(env.TASK_DIRECTORY+'/task.json',output+'/task.json');
  writeFileSync(output+'/manifest.json',JSON.stringify({version:1,runId:task.runId,attempt:task.attempt,base:task.base,
    patchHash:hash(patch),engineSha:env.ENGINE_SHA,model:native.model,digest:native.digest,context:native.context},null,2)+'\n');
  console.log('Model patch and usage frozen before candidate code execution.');
}finally{try{run('docker',['rm','-f',name]);}catch{}}
