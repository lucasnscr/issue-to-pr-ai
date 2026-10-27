import {execFileSync} from 'node:child_process';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateLearning} from '../../contracts/learning-v1.mjs';
import {generateLearning} from './learning.mjs';
export async function publishLearningPr(input,{repository=process.env.GITHUB_REPOSITORY,issueNumber,root=process.cwd(),execute=(program,args)=>execFileSync(program,args,{cwd:root,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']})}={}){
 const item=validateLearning(input);if(item.repository!==repository||!Number.isSafeInteger(issueNumber)||issueNumber<1)throw new Error('Learning publication identity mismatch');
 const branch=`sentinela-learning/${item.caseId}-v${item.version}-${item.hash.slice(0,12)}`;
 const existing=JSON.parse(execute('gh',['pr','list','--repo',repository,'--state','all','--head',branch,'--json','url']));if(existing.length>1)throw new Error('Ambiguous learning PR');if(existing[0])return existing[0].url;
 execute('git',['merge-base','--is-ancestor',item.commitSha,'HEAD']);
 const manifest=await generateLearning(item,{root,repository});const files=[...Object.keys(manifest.files),`evaluations/incidents/${item.caseId}/manifest-v${item.version}.json`];
 execute('git',['switch','-c',branch]);execute('git',['add','--',...files]);
 const staged=execute('git',['diff','--cached','--name-only']).trim().split('\n').filter(Boolean);if(staged.length!==files.length||staged.some(file=>!files.includes(file)))throw new Error('Unexpected staged learning changes');
 execute('git',['commit','-m',`test: preserve reviewed incident ${item.caseId} v${item.version}`]);execute('git',['push','origin',branch]);
 const bodyFile=process.env.RUNNER_TEMP?process.env.RUNNER_TEMP+'/learning-pr.md':root+'/.git/learning-pr.md';
 await writeFile(bodyFile,`Gera regressão Java, avaliação e runbook a partir do aprendizado aprovado v${item.version}.\n\nResponsável: ${item.content.owner}. Hash: ${item.hash}. Commit verificado: ${item.commitSha}.\n\nMaven com PostgreSQL real passou em job separado antes da publicação. Revisão humana necessária.\n\nCloses #${issueNumber}\n`);
 const url=execute('gh',['pr','create','--repo',repository,'--draft','--head',branch,'--title',`Preservar aprendizado revisado de ${item.service} v${item.version}`,'--body-file',bodyFile]).trim();
 execute('gh',['workflow','run','ci.yml','--repo',repository,'--ref',branch]);return url;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){console.log(await publishLearningPr(JSON.parse(await readFile(process.env.LEARNING_EXPORT_FILE,'utf8')),{issueNumber:Number(process.env.LEARNING_ISSUE_NUMBER)}));}
