import {readFile,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {validateLearning,digest,evaluateDiagnosis} from '../../contracts/learning-v1.mjs';
import {endpoint} from './client.mjs';
export async function fetchLearning(caseId,version,{env=process.env,request=fetch}={}){
 if(!/^[a-f0-9-]{36}$/.test(caseId)||!Number.isSafeInteger(version)||version<1||version>20)throw new Error('Invalid case/version');
 if(!env.SENTINELA_CALLBACK_TOKEN)throw new Error('Callback credential required');
 const response=await request(new URL(`/api/sdlc/cases/${caseId}/learning?version=${version}`,endpoint(env)),{headers:{authorization:'Bearer '+env.SENTINELA_CALLBACK_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Approved learning unavailable');
 const raw=await response.text();if(Buffer.byteLength(raw)>20000)throw new Error('Learning payload exceeds limit');
 const item=validateLearning(JSON.parse(raw));if(item.caseId!==caseId||item.version!==version||item.repository!==env.GITHUB_REPOSITORY)throw new Error('Learning identity mismatch');return item;
}
export async function generateLearning(input,{root=process.cwd(),repository}={}){
 const item=validateLearning(input);if(!repository||item.repository!==repository)throw new Error('Explicit target repository mismatch');
 const base=await realpath(root),className='Incident'+item.caseId.replaceAll('-','')+'V'+item.version+'IT';
 const resource=`sentinela/${item.caseId}/v${item.version}.json`,folder=`evaluations/incidents/${item.caseId}`;
 const template=await readFile(new URL('./learning-template.java.txt',import.meta.url),'utf8');
 const files={
  [`apps/catalog-api/src/test/java/dev/continuousai/catalog/product/${className}.java`]:template.replace('__CLASS__',className).replace('__RESOURCE__','/'+resource),
  [`apps/catalog-api/src/test/resources/${resource}`]:JSON.stringify(item,null,2)+'\n',
  [`docs/incident-learning/${item.caseId}/v${item.version}.md`]:`# Aprendizado do incidente ${item.caseId}\n\nVersão ${item.version}; responsável: ${item.content.owner}; revisão: ${item.reviewer}.\nCommit verificado: ${item.commitSha}. Hash de aprovação: ${item.hash}.\n\n## Causa revisada\n\n${item.content.rootCause}\n\n## Procedimento revisado\n\n${item.content.runbook}\n`,
  [`${folder}/v${item.version}.json`]:JSON.stringify({rubric:'cause-action-evidence/v1',learning:item},null,2)+'\n'
 };
 const manifest={protocol:item.protocol,caseId:item.caseId,version:item.version,learningHash:item.hash,owner:item.content.owner,commitSha:item.commitSha,className,files:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,digest(content)]))};
 files[`${folder}/manifest-v${item.version}.json`]=JSON.stringify(manifest,null,2)+'\n';
 // Preflight the whole set. Never overwrite maintained or conflicting content.
 for(const [name,content] of Object.entries(files)){
  if(Buffer.byteLength(content)>20000)throw new Error('Generated file exceeds 5,000 tokens; reduce fixture or split the profile.');
  let current=base;for(const part of name.split('/')){current=path.join(current,part);try{if((await lstat(current)).isSymbolicLink())throw new Error('Symlink destination refused');}catch(error){if(error.code!=='ENOENT')throw error;}}
  try{if(await readFile(path.join(base,name),'utf8')!==content)throw new Error('Existing learning content differs; create another approved version.');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 for(const [name,content] of Object.entries(files)){const file=path.join(base,name);await mkdir(path.dirname(file),{recursive:true});try{await writeFile(file,content,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await readFile(file,'utf8')!==content)throw error;}}
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){
 const [mode,...args]=process.argv.slice(2);
 if(mode==='fetch'){
  const item=await fetchLearning(args[0],Number(args[1]));await writeFile(args[2],JSON.stringify(item,null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Approved export saved; no source executed.');
 }else if(mode==='generate'){
  const item=validateLearning(JSON.parse(await readFile(args[0],'utf8')));
  try{execFileSync('git',['merge-base','--is-ancestor',item.commitSha,'HEAD'],{stdio:'ignore',timeout:10000});}catch{throw new Error('Checkout must contain the verified correction commit');}
  console.log(JSON.stringify(await generateLearning(item,{repository:args[1]})));
 }
 else if(mode==='evaluate'){
  const result=evaluateDiagnosis(JSON.parse(await readFile(args[0],'utf8')).learning,JSON.parse(await readFile(args[1],'utf8')));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
 }else throw new Error('Use fetch CASE VERSION OUTPUT, generate EXPORT REPOSITORY, or evaluate CASE RESPONSE');
}
