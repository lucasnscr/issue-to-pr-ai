import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {run,frozen,hash} from './common.mjs';
import {validateChanges} from '../validate-agent-changes.mjs';
import {validateVmApplication,stopVmApplication} from '../vm-validation.mjs';
const env=process.env,workspace=resolve(env.CANDIDATE_DIRECTORY),engine=resolve(env.ENGINE_DIRECTORY),directory=resolve(env.FROZEN_DIRECTORY);
const {task,manifest}=frozen(directory);
if(manifest.engineSha!==env.ENGINE_SHA)throw Error('Engine provenance differs.');
run('git',['apply','--check',directory+'/candidate.patch'],workspace);
run('git',['apply','--index',directory+'/candidate.patch'],workspace);
validateChanges(workspace,task.base,task.profile);
run(process.execPath,[engine+'/scripts/check-staged-file-size.mjs'],workspace);
const remote=resolve(env.VALIDATION_DIRECTORY);mkdirSync(remote,{recursive:true});
const guest=(cmd,...args)=>run(cmd,args,undefined,{timeout:1200000});
const options={guest,profile:task.profile,workspace,engine,remote,project:'local-ci-'+task.runId};
try{
  validateVmApplication(options);
  const files=validateChanges(workspace,task.base,task.profile);run('git',['add','--',...files],workspace);
  if(hash(run('git',['diff','--cached','--binary'],workspace))!==manifest.patchHash)throw Error('Candidate changed during validation.');
  console.log('Independent regression passed for the frozen patch. No publication credential was available.');
}catch(error){
  try{console.error(readFileSync(remote+'/validation.log','utf8').slice(-8000));}catch{}
  throw Error('Independent validation failed; publication is blocked.');
}finally{try{stopVmApplication(options);}catch{}}
