const {test}=require('node:test');const assert=require('node:assert/strict');
test('independent TypeScript validation uses isolated PostgreSQL and all required checks',async()=>{
  const {validateVmApplication,stopVmApplication}=await import('../vm-validation.mjs');
  const calls=[];const args={guest:(...a)=>calls.push(a),profile:'sentinela-typescript',workspace:'/tmp/job/workspace',remote:'/tmp/job',engine:'/tmp/engine',project:'ai-test'};
  validateVmApplication(args);stopVmApplication(args);
  const commands=JSON.stringify(calls);
  for(const value of ['pgvector/pgvector:pg17','127.0.0.1:55432:5432','npm run check','npm test','npm run test:integration','npm run build','npm run test:e2e:provider','npm run test:e2e:operations'])assert.ok(commands.includes(value));
  assert.ok(!commands.includes('GITHUB_TOKEN'));assert.equal(calls.at(-1).at(-1),'sentinela-db-ai-test');
  assert.throws(()=>validateVmApplication({...args,profile:'issue-supplied-command'}));
});
