import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Independent public configuration contract. No inference, keys or HTTP calls.
const { parseProviderSettings } = await import(pathToFileURL(resolve('lib/ai/configuration.ts')).href);
let checks = 0;
for (const role of ['diagnosis', 'embedding']) {
  const prefix = role === 'diagnosis' ? 'AI_' : 'EMBEDDING_';
  const base = { [prefix + 'PROVIDER']: 'ollama', [prefix + 'MODEL']: 'synthetic-local' };
  const defaults = parseProviderSettings(base, role);
  assert.equal(defaults.timeoutMs, role === 'diagnosis' ? 30000 : 20000); checks++;
  for (const value of ['100', '300000']) {
    const settings = parseProviderSettings({ ...base, [prefix + 'TIMEOUT_MS']: value }, role);
    assert.equal(settings.configured, true); assert.equal(settings.timeoutMs, Number(value)); checks++;
  }
  for (const value of ['0', '-1', '100.5', '300001', 'synthetic-secret-marker']) {
    const settings = parseProviderSettings({ ...base, [prefix + 'TIMEOUT_MS']: value }, role);
    assert.equal(settings.configured, false);
    assert.ok(settings.configurationError.includes(prefix + 'TIMEOUT_MS'));
    assert.match(settings.configurationError, /100.*300000/);
    assert.equal(settings.configurationError.includes('synthetic-secret-marker'), false); checks++;
  }
  const other = role === 'diagnosis' ? 'EMBEDDING_TIMEOUT_MS' : 'AI_TIMEOUT_MS';
  assert.equal(parseProviderSettings({ ...base, [other]: 'invalid' }, role).configured, true); checks++;
}
console.log(JSON.stringify({ result: 'passed', scope: 'sentinela-timeout-contract', checks }));
