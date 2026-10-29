import {api,frozen} from './common.mjs';
const {task,manifest}=frozen(process.env.FROZEN_DIRECTORY);
const deadline=Date.now()+360000;
let found=false;
while(Date.now()<deadline){
  const prs=api(`repos/${task.repository}/pulls?state=open&per_page=100`);
  const matching=prs.filter(pr=>pr.head?.repo?.full_name===task.repository&&pr.base.sha===task.base&&
    pr.head.ref===`ai/issue-${task.issue}-run-${task.runId}`&&pr.body?.includes(`<!-- local-ai-patch:${manifest.patchHash} -->`));
  if(matching.length>1)throw Error('Ambiguous local publication.');
  if(matching.length===1){console.log('Validated local publication receipt: '+matching[0].html_url);found=true;break;}
  await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!found)throw Error('Local publisher did not provide a matching PR; implementation remains incomplete.');
