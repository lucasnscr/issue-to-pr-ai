import {readFile,writeFile,realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {githubApi} from './github.mjs';
import {fetchLearning} from './learning.mjs';
export function learningMarker(body){
 const found=[...(body||'').matchAll(/<!-- sentinela-learning\/v1 version=([1-9][0-9]?) case=([a-f0-9-]{36}) proposal=([a-f0-9]{64}) -->/g)];
 if(!found.length)return null;if(found.length!==1)throw new Error('Ambiguous learning marker');
 return {caseId:found[0][2],version:Number(found[0][1]),hash:found[0][3]};
}
export async function prepareLearningIssue(number,{env=process.env,api=githubApi,request=fetch}={}){
 if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid learning issue');
 const issue=await api(`repos/${env.GITHUB_REPOSITORY}/issues/${number}`);if(issue.pull_request)throw new Error('Expected learning issue');
 const marker=learningMarker(issue.body);if(!marker)return null;
 const learning=await fetchLearning(marker.caseId,marker.version,{env,request});if(learning.hash!==marker.hash)throw new Error('Reviewed learning hash changed');return learning;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){
 const item=await prepareLearningIssue(Number(process.env.LEARNING_ISSUE_NUMBER));if(!item)throw new Error('Not a learning issue');await writeFile(process.env.LEARNING_EXPORT_FILE,JSON.stringify(item,null,2)+'\n',{mode:0o600,flag:'wx'});
}
