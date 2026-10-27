import {execFileSync} from 'node:child_process';
import {repository} from '../../contracts/sdlc-v1.mjs';
export function githubApi(path){
  try{return JSON.parse(execFileSync('gh',['api','--hostname','github.com',path],{encoding:'utf8',maxBuffer:2_000_000,timeout:15000,stdio:['ignore','pipe','pipe']}));}
  catch{throw new Error('GitHub não confirmou os metadados da entrega.');}
}
export async function changeContext({repo,prNumber,commitSha,requireMerged=false,allowClosed=false},api=githubApi){
  repository(repo);if(!Number.isSafeInteger(prNumber)||prNumber<1||!/^[a-f0-9]{40}$/.test(commitSha||''))throw new Error('PR/SHA inválidos.');
  const pr=await api(`repos/${repo}/pulls/${prNumber}`);
  if(pr.base?.repo?.full_name!==repo||pr.head?.repo?.full_name!==repo)throw new Error('PR fora do repositório autorizado.');
  if(requireMerged){
    if(!pr.merged||!pr.merge_commit_sha)throw new Error('A entrega exige merge decidido pelo mantenedor.');
    const ancestry=await api(`repos/${repo}/compare/${pr.merge_commit_sha}...${commitSha}`);
    if(!['identical','ahead'].includes(ancestry.status))throw new Error('O commit não contém a correção integrada.');
  }else if(pr.head?.sha!==commitSha||pr.state!==(allowClosed?'closed':'open'))throw new Error('SHA/estado da PR mudou.');
  const issueMatches=[...(pr.body||'').matchAll(/(?:closes|fixes|resolves)\s+#([1-9][0-9]*)\b/gi)];
  const numbers=[...new Set(issueMatches.map(match=>Number(match[1])))];if(numbers.length!==1)throw new Error('PR deve vincular exatamente uma issue de correção.');
  const issue=await api(`repos/${repo}/issues/${numbers[0]}`);if(issue.pull_request)throw new Error('Vínculo aponta para uma PR.');
  return {pr,issue};
}
