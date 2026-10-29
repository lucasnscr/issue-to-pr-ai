const {test}=require('node:test');const assert=require('node:assert/strict');
test('local delivery requires an open issue with explicit authorization and stable content',async()=>{
  const {issueSnapshot,targetProfile,verifyVm}=await import('../local-issue-policy.mjs');
  const issue={number:42,title:'Acceptance',body:'Preserve behavior and add a regression',state:'OPEN',labels:[{name:'ai:ready'}]};
  assert.notEqual(issueSnapshot(issue),issueSnapshot({...issue,body:'Changed criteria'}));
  for(const replacement of [{state:'CLOSED'},{labels:[]},{pull_request:{}},{body:'x'.repeat(20001)}])assert.throws(()=>issueSnapshot({...issue,...replacement}));
  assert.equal(targetProfile('lucasnscr/issue-to-pr-ai'),'catalog-java');assert.throws(()=>targetProfile('other/repo'));
  const vm={name:'sentinela-ai-pilot',status:'Running',config:{mounts:[]}};verifyVm(vm,vm.name);
  assert.throws(()=>verifyVm({...vm,config:{mounts:[{location:'~'}]}},vm.name));
  assert.throws(()=>verifyVm({...vm,config:{ssh:{forwardAgent:true}}},vm.name));
  assert.throws(()=>verifyVm({...vm,config:undefined},vm.name));
});
test('profile selection is bounded and cannot supply arbitrary commands or write configuration',async()=>{
  const {implementationProfile,implementationPrompt}=await import('../implementation-profiles.mjs');
  const profile=implementationProfile('catalog-java');assert.equal(profile.allowed('.github/workflows/ci.yml'),false);
  assert.equal(profile.allowed('apps/catalog-api/README.md'),true);
  assert.equal(profile.regression('apps/catalog-api/src/test/java/a/CacheIT.java'),true);
  assert.throws(()=>implementationProfile('$(command)'));assert.match(implementationPrompt(),/do not run commands/);
  const sentinela=implementationProfile('sentinela-typescript');
  assert.ok(sentinela.allowed('lib/ai/configuration.ts'));
  for(const file of ['lib/db.ts','.env.local','package.json','.github/workflows/ci.yml','contracts/sdlc-v1.mjs'])assert.equal(sentinela.allowed(file),false);
  assert.ok(sentinela.regression('tests/ai-configuration.test.ts'));
  assert.equal(sentinela.allowed('apps/catalog-api/src/main/java/a/Main.java'),false);
});
