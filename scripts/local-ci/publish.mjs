import {writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {run,gh,api,frozen,reauthorize} from './common.mjs';
import {validateChanges} from '../validate-agent-changes.mjs';
import {caseMarker,extractCase} from '../../contracts/sdlc-v1.mjs';
const env=process.env,workspace=resolve(env.CANDIDATE_DIRECTORY),engine=resolve(env.ENGINE_DIRECTORY),directory=resolve(env.FROZEN_DIRECTORY);
const {task,manifest,usage}=frozen(directory);
if(task.publishMode!==(env.GH_TOKEN?'github':'local'))throw Error('Publication authority differs from the authorized workflow mode.');
if(manifest.engineSha!==env.ENGINE_SHA)throw Error('Untrusted engine in frozen candidate.');
const issue=reauthorize(task);
const open=api(`repos/${task.repository}/pulls?state=open&per_page=100`);
const marker=`<!-- local-ai-issue:${task.issue} -->`,patchMarker=`<!-- local-ai-patch:${manifest.patchHash} -->`;
const previous=open.filter(pr=>pr.body?.includes(marker));
if(previous.length){
  if(previous.length!==1||!previous[0].body.includes(patchMarker)||previous[0].base.sha!==task.base)throw Error('Another delivery exists for this issue; review it before retrying.');
  console.log('Existing identical draft delivery: '+previous[0].html_url);
}else{
  run('git',['apply','--check',directory+'/candidate.patch'],workspace);run('git',['apply','--index',directory+'/candidate.patch'],workspace);
  validateChanges(workspace,task.base,task.profile);run(process.execPath,[engine+'/scripts/check-staged-file-size.mjs'],workspace);
  const branch=`ai/issue-${task.issue}-run-${task.runId}`;
  run('git',['switch','-c',branch],workspace);
  run('git',['config','user.name',env.GH_TOKEN?'github-actions[bot]':'local-ai-delivery'],workspace);
  run('git',['config','user.email',env.GH_TOKEN?'41898282+github-actions[bot]@users.noreply.github.com':'local-ai-delivery@users.noreply.github.com'],workspace);
  run('git',['-c','core.hooksPath=/dev/null','commit','-m',`Implement issue #${task.issue} with isolated local model`],workspace);
  reauthorize(task);if(env.GH_TOKEN)gh('auth','setup-git');run('git',['push','origin',branch],workspace);
  const linked=extractCase(issue.body);
  const body=`Closes #${task.issue}\n\n${marker}\n${patchMarker}\n\nImplementação por OpenCode 1.19.3 e Qwen/Ollama local. Perfil ${task.profile}; engine ${manifest.engineSha}; base ${task.base}.\n\nPatch/uso congelados antes da execução de código candidato. Validação independente em runner hospedado, sem token de publicação. ${usage.usage.steps} etapas; ${usage.usage.policyTokenUnits} unidades de tokens.\n\nExecução: https://github.com/${task.repository}/actions/runs/${task.runId}\n\nPR draft. Revisão, merge, deploy e recuperação verificada continuam separados.\n${linked?'\n'+caseMarker(linked.caseId,linked.proposalHash)+'\n':''}`;
  const file=directory+'/pr.md';writeFileSync(file,body);
  const title=issue.title.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,120);
  const url=gh('pr','create','--repo',task.repository,'--draft','--base',task.branch,'--head',branch,'--title',title,'--body-file',file).trim();
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,`PR draft: ${url}\n`);console.log(url);
  if(env.GH_TOKEN){
    gh('workflow','run','ci.yml','--repo',task.repository,'--ref',branch);
    if(task.profile==='sentinela-typescript')gh('workflow','run','sdlc-integration.yml','--repo',task.repository,'--ref',branch);
  }
}
