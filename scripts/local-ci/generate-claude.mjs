import {mkdirSync,readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {run,hash,validateTask} from './common.mjs';
import {implementationIdentity} from './agent-identity.mjs';
import {validateChanges} from '../validate-agent-changes.mjs';
export function claudeContainerArguments({workspace,engine,output,taskDirectory,task}) {
  const {model,agent}=implementationIdentity(task);
  if(agent!=='claude')throw Error('Claude generation requires a Claude task.');
  return ['run','--rm','--name','sentinela-claude-'+task.runId+'-'+task.attempt,'--read-only','--cap-drop=ALL',
    '--security-opt=no-new-privileges','--pids-limit=128','--memory=2g','--cpus=2','--user',`${process.getuid()}:${process.getgid()}`,
    '--tmpfs','/tmp:rw,exec,size=1g,mode=1777','-v',workspace+':/workspace:rw','-v',engine+':/engine:ro',
    '-v',taskDirectory+'/task.md:/task.md:ro','-v',output+':/artifacts:rw',
    '-e','ANTHROPIC_API_KEY','-e','IMPLEMENTATION_AGENT=claude','-e','MODEL='+model,
    '-e','TASK_FILE=/task.md','-e','AI_RULES_FILE=/workspace/AGENTS.md','-e','IMPLEMENTATION_PROFILE='+task.profile,
    '-e','AI_USAGE_FILE=/artifacts/ai-usage.json','-e','AI_SUMMARY_FILE=/artifacts/implementation-summary.md',
    '-e','GITHUB_RUN_ID='+task.runId,'-e','GITHUB_RUN_ATTEMPT='+task.attempt,
    '--entrypoint','node','issue-to-pr-claude:2.1.306','/engine/scripts/run-implementation.mjs'];
}
export function generateClaude({env=process.env,execute=run}={}) {
  const workspace=resolve(env.CANDIDATE_DIRECTORY),engine=resolve(env.ENGINE_DIRECTORY),output=resolve(env.FROZEN_DIRECTORY);
  const taskDirectory=resolve(env.TASK_DIRECTORY),task=validateTask(JSON.parse(readFileSync(taskDirectory+'/task.json','utf8')),env);
  const identity=implementationIdentity(task);
  if(identity.agent!=='claude'||!env.ANTHROPIC_API_KEY)throw Error('Authorized Claude task and ANTHROPIC_API_KEY are required.');
  if(execute('git',['rev-parse','HEAD'],workspace).trim()!==task.base)throw Error('Candidate differs from the authorized base.');
  mkdirSync(output,{recursive:true});
  execute('docker',['build','-t','issue-to-pr-claude:2.1.306',engine+'/infra/agents/claude'],undefined,{timeout:300000});
  const args=claudeContainerArguments({workspace,engine,output,taskDirectory,task});
  try {
    execute('docker',args,undefined,{timeout:1000000,env:{PATH:env.PATH,HOME:env.HOME,ANTHROPIC_API_KEY:env.ANTHROPIC_API_KEY}});
    const files=validateChanges(workspace,task.base,task.profile);execute('git',['add','--',...files],workspace);
    const patch=execute('git',['diff','--cached','--binary'],workspace);
    writeFileSync(output+'/candidate.patch',patch);copyFileSync(taskDirectory+'/task.json',output+'/task.json');
    writeFileSync(output+'/manifest.json',JSON.stringify({version:1,...identity,runId:task.runId,attempt:task.attempt,
      base:task.base,patchHash:hash(patch),engineSha:env.ENGINE_SHA},null,2)+'\n');
    console.log('Claude patch and usage frozen; independent validation is required before publication.');
  } finally {try{execute('docker',['rm','-f','sentinela-claude-'+task.runId+'-'+task.attempt]);}catch{}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)generateClaude();
