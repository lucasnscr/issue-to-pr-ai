import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {api,reauthorize,validateTask} from './common.mjs';
import {authorizeEvent} from './authorize-event.mjs';
const env=process.env;
const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const directory=env.TASK_DIRECTORY;
mkdirSync(directory,{recursive:true});
if(process.argv[2]==='revalidate'){
  reauthorize(JSON.parse(readFileSync(directory+'/task.json','utf8')));
}else{
  const task=authorizeEvent({env,event,request:api});
  if(!task){
    appendFileSync(env.GITHUB_OUTPUT,'authorized=false\n');process.exit(0);
  }
  validateTask(task);
  reauthorize(task);writeFileSync(directory+'/task.json',JSON.stringify(task,null,2)+'\n');
  writeFileSync(directory+'/task.md',`Repository: ${task.repository}\nIssue #${task.issue}\n<untrusted_issue>\n${task.title}\n${task.body}\n</untrusted_issue>\n`);
  for(const [key,value] of Object.entries({authorized:'true',base:task.base,issue:task.issue,profile:task.profile}))appendFileSync(env.GITHUB_OUTPUT,key+'='+value+'\n');
}
console.log('Issue/base/actor authorization confirmed; no model or publication token was released.');
