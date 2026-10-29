import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export function ollamaEndpoint(value = 'http://127.0.0.1:11434') {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new Error('Ollama requires a root HTTPS URL or loopback HTTP URL without credentials.');
  }
  return url.origin;
}

export async function ollamaJson(base, path, body, { fetcher = fetch, timeoutMs = 180000, apiKey } = {}) {
  let response;
  try {
    response = await fetcher(base + path, { method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs) });
  } catch { throw new Error('OLLAMA_UNAVAILABLE_OR_TIMEOUT'); }
  if (!response.ok) throw new Error(`OLLAMA_HTTP_${response.status}`);
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 1048576) throw new Error('OLLAMA_RESPONSE_LIMIT');
    text += decoder.decode(chunk, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('OLLAMA_INVALID_JSON'); }
}

export function toolArguments(result, expected) {
  const calls = result?.message?.tool_calls;
  if (!result?.done || calls?.length !== 1 || calls[0]?.function?.name !== expected ||
      !calls[0].function.arguments || typeof calls[0].function.arguments !== 'object') {
    throw new Error('OLLAMA_INVALID_TOOL_CALL');
  }
  return calls[0].function.arguments;
}

export async function preflight({ baseUrl, model = 'qwen3-coder:30b', context = 64000,
  fetcher = fetch, apiKey, timeoutMs = 180000, now = Date.now } = {}) {
  const base = ollamaEndpoint(baseUrl);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,180}$/.test(model) || model.includes('..')) throw new Error('Invalid Ollama model.');
  if (!Number.isSafeInteger(context) || context < 64000 || context > 262144) throw new Error('Context must be 64000..262144.');
  const started = now();
  const call = (path, body) => ollamaJson(base, path, body, { fetcher, apiKey, timeoutMs });
  const version = await call('/api/version');
  const inventory = await call('/api/tags');
  const identity = inventory.models?.find(item => item.name === model || item.model === model);
  if (!identity || !/^(sha256:)?[a-f0-9]{64}$/.test(identity.digest || '')) throw new Error('OLLAMA_MODEL_NOT_INSTALLED');
  const metadata = await call('/api/show', { model });
  if (!metadata.capabilities?.includes('tools')) throw new Error('OLLAMA_TOOLS_UNSUPPORTED');
  const token = randomUUID();
  const tools = [{ type: 'function', function: { name: 'read_fixture', description: 'Read the synthetic fixture.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } } },
  { type: 'function', function: { name: 'update_fixture', description: 'Update the synthetic fixture using its exact receipt.',
    parameters: { type: 'object', properties: { receipt: { type: 'string' }, status: { type: 'string', enum: ['healthy'] } },
      required: ['receipt', 'status'], additionalProperties: false } } }];
  const messages = [{ role: 'user', content: 'Call read_fixture with no arguments. Do not call update_fixture until you have read its receipt.' }];
  const chat = () => call('/api/chat', { model, messages, tools, stream: false, keep_alive: '5m',
    options: { num_ctx: context, num_predict: 512, temperature: 0 } });
  const first = await chat();
  if (Object.keys(toolArguments(first, 'read_fixture')).length) throw new Error('OLLAMA_INVALID_TOOL_ARGUMENTS');
  messages.push(first.message, { role: 'tool', tool_name: 'read_fixture', content: JSON.stringify({ receipt: token, status: 'degraded' }) },
    { role: 'user', content: 'Now call update_fixture with the exact receipt read and status healthy. Do not call any other tool.' });
  const second = await chat();
  const args = toolArguments(second, 'update_fixture');
  if (args.receipt !== token || args.status !== 'healthy' || Object.keys(args).length !== 2) throw new Error('OLLAMA_INVALID_TOOL_ARGUMENTS');
  const running = await call('/api/ps');
  const loaded = running.models?.find(item => item.digest === identity.digest);
  if (!loaded || loaded.context_length < context) throw new Error('OLLAMA_INSUFFICIENT_EFFECTIVE_CONTEXT');
  for (const result of [first, second]) {
    if (!Number.isSafeInteger(result.prompt_eval_count) || result.prompt_eval_count < 1 ||
        !Number.isSafeInteger(result.eval_count) || result.eval_count < 1) throw new Error('OLLAMA_USAGE_UNAVAILABLE');
  }
  return { version: 1, result: 'passed', scope: 'native-tool-preflight', model, digest: identity.digest,
    runtimeVersion: version.version, quantization: metadata.details?.quantization_level || identity.details?.quantization_level,
    context: loaded.context_length, modelBytes: loaded.size, acceleratorBytes: loaded.size_vram,
    durationMs: now() - started, tokens: { input: first.prompt_eval_count + second.prompt_eval_count,
      output: first.eval_count + second.eval_count }, tools: ['read_fixture', 'update_fixture'],
    limitations: ['Synthetic constrained tools; OpenCode editing and application delivery require separate validation.'],
    recordedAt: new Date().toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const file = process.env.OLLAMA_REPORT || 'artifacts/ollama-preflight.json';
  try {
    const report = await preflight({ baseUrl: process.env.OLLAMA_BASE_URL, model: process.env.OLLAMA_MODEL,
      apiKey: process.env.OLLAMA_API_KEY, context: Number(process.env.OLLAMA_CONTEXT || 64000) });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(error.message.startsWith('OLLAMA_') ? error.message : 'Invalid preflight configuration.');
    process.exitCode = 1;
  }
}
