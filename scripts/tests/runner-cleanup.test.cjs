const {test}=require('node:test');const assert=require('node:assert/strict');
test('restart cleanup destroys local VM before a busy GitHub runner and retries removal',async()=>{
  const {discardRunner}=await import('../runner-cleanup.mjs');const actions=[];let exists=true,busy=true;
  await discardRunner({vm:'sentinela-ai-job-1234abcd',repo:'lucasnscr/issue-to-pr-ai',runId:99,
    listVms:()=>exists?[{name:'sentinela-ai-job-1234abcd'}]:[],deleteVm:()=>{actions.push('vm');exists=false;},
    listRunners:()=>busy?[{name:'sentinela-ai-job-1234abcd',id:1,busy:true}]:[],
    deleteRunner:()=>{actions.push('delete');if(busy)throw Error('422 busy');},cancelRun:()=>actions.push('cancel'),
    delay:async()=>{busy=false;},record:value=>actions.push(value)});
  assert.deepEqual(actions.slice(0,3),['vm','cancel','delete']);assert.equal(actions.at(-1).registrationRemoved,true);
});
test('GitHub outage never retains the VM or falsely reports registration removed',async()=>{
  const {discardRunner}=await import('../runner-cleanup.mjs');let exists=true;const records=[];
  await assert.rejects(discardRunner({vm:'sentinela-ai-job-1234abcd',repo:'lucasnscr/issue-to-pr-ai',runId:99,
    listVms:()=>exists?[{name:'sentinela-ai-job-1234abcd'}]:[],deleteVm:()=>{exists=false;},listRunners:()=>{throw Error('offline');},
    deleteRunner:()=>{},cancelRun:()=>{},attempts:2,delay:async()=>{},record:value=>records.push(value)}),/not confirmed/);
  assert.equal(exists,false);assert.equal(records[0].type,'cleanup-incomplete');assert.equal(records[0].registrationRemoved,false);
});
