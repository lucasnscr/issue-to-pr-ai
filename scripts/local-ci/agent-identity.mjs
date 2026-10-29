import {loadPolicy} from '../ai-policy.mjs';
export function implementationIdentity(task={}) {
  const agent=task.agent??'opencode';
  const model=task.model??'ollama/qwen3-coder:30b';
  if(!((agent==='opencode'&&model==='ollama/qwen3-coder:30b')||
    (agent==='claude'&&typeof model==='string'&&model.startsWith('anthropic/'))))throw Error('Unsupported implementation agent/model.');
  loadPolicy('implementation',model);
  return {agent,model};
}
export function matchesImplementationCommand(body,agent='opencode') {
  return typeof body==='string'&&(agent==='claude'?/^\s*@claude(?=\s|$)/i:/^\s*\/(oc|opencode)(?=\s|$)/i).test(body);
}
export function publicationWorkflow(path) {
  if(path==='.github/workflows/ollama-implementation.yml')return {agent:'opencode',reusable:'ollama-reusable.yml'};
  if(path==='.github/workflows/claude-implementation.yml')return {agent:'claude',reusable:'claude-reusable.yml'};
  throw Error('Untrusted implementation publication workflow.');
}
