const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const tokenValue = value => nonnegative(value) && Number.isSafeInteger(value);

// OpenCode 1.19.3 `run --format json`: step_finish.part has cost/tokens.
// Keep aggregate numbers only; tool output, prompts, errors and secrets are never
// copied to this record. Part IDs identify repeat updates without double billing.
export function createUsageTracker() {
  const finished = new Map();
  const started = new Set();
  let invalidUsageEvents = 0;
  return {
    observe(event) {
      if (event?.type !== 'step_finish' && event?.type !== 'step_start') return;
      const part = event.part;
      if (!part || typeof part.id !== 'string' || !part.id ||
        typeof part.sessionID !== 'string' || !part.sessionID) {
        invalidUsageEvents++;
        return;
      }
      const id = `${part.sessionID}/${part.id}`;
      if (event.type === 'step_start') {
        started.add(id);
        return;
      }
      const tokens = part.tokens;
      const valid = nonnegative(part.cost) && tokens &&
        [tokens.input, tokens.output, tokens.reasoning, tokens.cache?.read, tokens.cache?.write].every(tokenValue) &&
        (tokens.total === undefined || tokenValue(tokens.total));
      if (!valid) {
        invalidUsageEvents++;
        return;
      }
      finished.set(id, { cost: part.cost, input: tokens.input, output: tokens.output,
        reasoning: tokens.reasoning, cacheRead: tokens.cache.read, cacheWrite: tokens.cache.write,
        total: tokens.total ?? null });
    },
    snapshot() {
      const parts = [...finished.values()];
      const sum = key => parts.reduce((total, part) => total + part[key], 0);
      const available = parts.length > 0;
      const tokens = available ? Object.fromEntries(['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite']
        .map(key => [key, sum(key)])) : null;
      return {
        source: 'opencode-step-finish',
        complete: available && invalidUsageEvents === 0 && started.size <= parts.length,
        steps: parts.length,
        startedSteps: started.size,
        invalidUsageEvents,
        tokens,
        reportedTotalTokens: available && parts.every(part => part.total !== null) ? sum('total') : null,
        // Deliberately conservative accounting: reasoning may overlap output.
        // This is a policy unit, not a provider's billable token total.
        policyTokenUnits: tokens ? Object.values(tokens).reduce((total, value) => total + value, 0) : null,
        estimatedCostUsd: available ? Math.round(sum('cost') * 1e10) / 1e10 : null,
        costBasis: available ? 'opencode-model-pricing-estimate' : 'unavailable',
        providerBilledCostUsd: null,
      };
    },
  };
}

export function parseOpenCodeUsage(output) {
  const tracker = createUsageTracker();
  for (const line of String(output || '').split('\n')) {
    try { tracker.observe(JSON.parse(line)); } catch { /* Non-JSON CLI banners are not telemetry. */ }
  }
  return tracker.snapshot();
}
