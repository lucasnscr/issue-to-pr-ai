import { readFileSync } from 'node:fs';

export function validatePolicy(policy) {
  if (policy?.version !== 1 || !policy.profiles || typeof policy.profiles !== 'object') {
    throw new Error('Invalid AI policy version or profiles.');
  }
  for (const profile of Object.values(policy.profiles)) {
    if (!Array.isArray(profile?.allowedModels) || profile.allowedModels.length === 0 ||
      profile.allowedModels.some(model => typeof model !== 'string' ||
        !/^[a-z0-9-]+\/[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/.test(model) ||
        model.split('/').some(part => part === '..'))) {
      throw new Error('AI policy requires an explicit provider/model allowlist.');
    }
    for (const key of ['maxSteps', 'timeoutSeconds', 'maxPolicyTokenUnits', 'maxOutputBytes']) {
      if (!Number.isSafeInteger(profile[key]) || profile[key] < 1) throw new Error(`Invalid AI policy ${key}.`);
    }
    if (!Number.isFinite(profile.maxEstimatedCostUsd) || profile.maxEstimatedCostUsd <= 0 ||
      typeof profile.requireUsage !== 'boolean') throw new Error('Invalid AI policy cost or usage requirements.');
  }
  return policy;
}

export function loadPolicy(profileName, model, file = new URL('../config/ai-policy.json', import.meta.url)) {
  const policy = validatePolicy(JSON.parse(readFileSync(file, 'utf8')));
  const profile = policy.profiles[profileName];
  if (!Object.hasOwn(policy.profiles, profileName) || !profile) throw new Error('Unknown AI policy profile.');
  if (!profile.allowedModels.includes(model)) throw new Error('Model is not allowed by the AI policy.');
  return { version: policy.version, name: profileName, ...profile };
}

// Completion is checked separately: missing usage while a model is still streaming
// is expected, but publishing without complete telemetry is denied.
export function evaluateUsage(profile, usage, { final = true } = {}) {
  const reasons = [];
  if (usage.invalidUsageEvents > 0) reasons.push('INVALID_USAGE');
  if (final && profile.requireUsage && !usage.complete) reasons.push('USAGE_UNAVAILABLE');
  if (usage.steps > profile.maxSteps || usage.startedSteps > profile.maxSteps) reasons.push('STEP_LIMIT');
  if (usage.estimatedCostUsd !== null && usage.estimatedCostUsd > profile.maxEstimatedCostUsd) reasons.push('COST_LIMIT');
  if (usage.policyTokenUnits !== null && usage.policyTokenUnits > profile.maxPolicyTokenUnits) reasons.push('TOKEN_LIMIT');
  return { decision: reasons.length ? 'block' : 'allow', reasons };
}

export function assertUsageAllowed(profile, usage, options) {
  const decision = evaluateUsage(profile, usage, options);
  if (decision.decision !== 'allow') throw new Error(`AI policy blocked execution: ${decision.reasons.join(', ')}.`);
  return decision;
}
