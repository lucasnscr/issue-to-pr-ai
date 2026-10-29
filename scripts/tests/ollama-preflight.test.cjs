const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Ollama endpoint rejects remote plaintext, embedded credentials and API paths', async () => {
  const { ollamaEndpoint } = await import('../ollama-preflight.mjs');
  assert.equal(ollamaEndpoint(), 'http://127.0.0.1:11434');
  for (const value of ['http://gpu.internal:11434', 'https://user:pass@gpu.local', 'http://localhost:11434/v1', 'file:///tmp/key']) {
    assert.throws(() => ollamaEndpoint(value));
  }
});

test('tool preflight rejects malformed or additional calls', async () => {
  const { toolArguments } = await import('../ollama-preflight.mjs');
  for (const data of [{}, { done: true, message: { tool_calls: [] } },
    { done: true, message: { tool_calls: [{ function: { name: 'bash', arguments: {} } }] } }]) {
    assert.throws(() => toolArguments(data, 'read_fixture'), /INVALID_TOOL_CALL/);
  }
});

test('real protocol binds second tool receipt, effective context and usage, without exporting fixture', async () => {
  const { preflight } = await import('../ollama-preflight.mjs');
  for (const failure of ['none', 'context', 'usage', 'receipt', 'missing', 'tools', 'http']) {
    const digest = 'a'.repeat(64);
    const fetcher = async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : {};
      let data = {};
      if (url.endsWith('/api/version')) data = { version: 'test' };
      if (url.endsWith('/api/tags')) data = { models: failure === 'missing' ? [] : [{ name: 'qwen3-coder:30b', digest }] };
      if (url.endsWith('/api/show')) data = { capabilities: failure === 'tools' ? [] : ['tools'] };
      if (url.endsWith('/api/ps')) data = { models: [{ digest, context_length: failure === 'context' ? 4096 : 64000 }] };
      if (url.endsWith('/api/chat')) {
        const second = body.messages.length > 1;
        const receipt = second ? JSON.parse(body.messages[2].content).receipt : null;
        data = { done: true, prompt_eval_count: failure === 'usage' ? undefined : 10, eval_count: 5,
          message: { role: 'assistant', tool_calls: [{ function: { name: second ? 'update_fixture' : 'read_fixture',
            arguments: second ? { receipt: failure === 'receipt' ? 'wrong' : receipt, status: 'healthy' } : {} } }] } };
      }
      return new Response(JSON.stringify(data), { status: failure === 'http' ? 503 : 200 });
    };
    if (failure !== 'none') await assert.rejects(preflight({ fetcher }), /OLLAMA_/);
    else {
      const report = await preflight({ fetcher });
      assert.equal(report.result, 'passed');
      assert.equal(report.tokens.input, 20);
      assert.equal(JSON.stringify(report).includes('receipt'), false);
    }
  }
});
