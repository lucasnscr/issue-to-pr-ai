import { ollamaEndpoint } from './ollama-preflight.mjs';

export function implementationProvider(env) {
  const model = env.MODEL || '';
  if (model.startsWith('ollama/')) {
    const native = ollamaEndpoint(env.OLLAMA_BASE_URL);
    if (native.startsWith('https:') && !env.OLLAMA_API_KEY) throw new Error('OLLAMA_API_KEY is required for a remote inference gateway.');
    const runtimeModel = model.slice('ollama/'.length);
    const overlay = { enabled_providers: ['ollama'], share: 'disabled', autoupdate: false,
      provider: { ollama: { npm: '@ai-sdk/openai-compatible', name: 'Ollama',
        options: { baseURL: native + '/v1', ...(env.OLLAMA_API_KEY ? { apiKey: '{env:OLLAMA_API_KEY}' } : {}) },
        models: { [runtimeModel]: { name: runtimeModel, limit: { context: 64000, output: 4096 } } } } } };
    const clean = { ...env, OLLAMA_BASE_URL: native, OPENCODE_CONFIG_CONTENT: JSON.stringify(overlay) };
    for (const key of ['ANTHROPIC_API_KEY', 'VLLM_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete clean[key];
    return { env: clean, apiKey: env.OLLAMA_API_KEY, provider: 'ollama' };
  }
  const credential = model.startsWith('vllm/') ? 'VLLM_API_KEY' : model.startsWith('anthropic/') ? 'ANTHROPIC_API_KEY' : null;
  if (!credential) throw new Error('Unsupported implementation provider.');
  if (!env[credential]) throw new Error(`${credential} is required for the configured provider.`);
  return { env, apiKey: env[credential], provider: model.split('/')[0] };
}
