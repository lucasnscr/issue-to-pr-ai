const {test}=require('node:test');
const assert=require('node:assert/strict');

test('Ollama tags are explicitly allowed while arbitrary models remain denied',async()=>{
  const {loadPolicy,validatePolicy}=await import('../ai-policy.mjs');
  assert.equal(loadPolicy('implementation','ollama/qwen3-coder:30b').name,'implementation');
  assert.throws(()=>loadPolicy('implementation','ollama/unapproved:30b'),/not allowed/);
  const original=require('../../config/ai-policy.json');
  for(const model of ['ollama/qwen:tag:other','ollama/../secret','ollama/qwen;command','ollama/qwen:']){
    const policy=structuredClone(original);policy.profiles.implementation.allowedModels=[model];
    assert.throws(()=>validatePolicy(policy));
  }
});

test('local Ollama requires no cloud key, removes cloud credentials and disables fallback',async()=>{
  const {implementationProvider}=await import('../model-provider.mjs');
  const env={MODEL:'ollama/qwen3-coder:30b',ANTHROPIC_API_KEY:'synthetic-secret',OPENAI_API_KEY:'other-secret'};
  const result=implementationProvider(env);
  const config=JSON.parse(result.env.OPENCODE_CONFIG_CONTENT);
  assert.equal(config.provider.ollama.options.baseURL,'http://127.0.0.1:11434/v1');
  assert.deepEqual(config.enabled_providers,['ollama']);
  assert.equal(result.env.ANTHROPIC_API_KEY,undefined);
  assert.equal(result.env.OPENAI_API_KEY,undefined);
  assert.equal(env.ANTHROPIC_API_KEY,'synthetic-secret');
});

test('gateway credentials are required and configuration contains only a variable reference',async()=>{
  const {implementationProvider}=await import('../model-provider.mjs');
  assert.throws(()=>implementationProvider({MODEL:'ollama/qwen3-coder:30b',OLLAMA_BASE_URL:'https://gpu.example'}),/OLLAMA_API_KEY/);
  const result=implementationProvider({MODEL:'ollama/qwen3-coder:30b',OLLAMA_BASE_URL:'https://gpu.example',OLLAMA_API_KEY:'secret-value'});
  assert.equal(JSON.stringify(result.env.OPENCODE_CONFIG_CONTENT).includes('secret-value'),false);
  for(const MODEL of ['anthropic/claude-sonnet-4-6','vllm/qwen-coder'])assert.throws(()=>implementationProvider({MODEL}),/required/);
  assert.throws(()=>implementationProvider({MODEL:'unknown/model'}),/Unsupported/);
});
