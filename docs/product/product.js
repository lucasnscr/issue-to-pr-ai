const names={planned:'Planejada',validating:'Em validação',passed:'Validada',blocked:'Bloqueada'};
const list=document.querySelector('#phases');
function element(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
function items(parent,title,values){if(!values.length)return;parent.append(element('h3',title));const ul=element('ul');for(const value of values)ul.append(element('li',value));parent.append(ul);}
function render(){
  const query=document.querySelector('#search').value.toLocaleLowerCase('pt-BR');
  const status=document.querySelector('#status').value;
  const phases=globalThis.productPhases.filter(p=>(status==='all'||p.status===status)&&JSON.stringify(p).toLocaleLowerCase('pt-BR').includes(query));
  list.replaceChildren();
  for(const phase of phases){const card=element('details');card.id='phase-'+phase.id;card.open=location.hash==='#'+card.id;
    const summary=element('summary',phase.id+'. '+phase.title);summary.append(element('span',names[phase.status], 'badge '+phase.status));card.append(summary);
    const content=element('div',null,'content');content.append(element('p',phase.description));items(content,'Implementação',phase.changes);items(content,'Critérios de aceite',phase.acceptance);
    if(phase.evidence.length){content.append(element('h3','Evidências'));for(const evidence of phase.evidence){const p=element('p',evidence.text);if(evidence.url){const url=new URL(evidence.url,location.href);if(['https:','http:'].includes(url.protocol)){const a=element('a',' Abrir evidência');a.href=url.href;p.append(a);}}content.append(p);}}
    else content.append(element('p','Nenhuma evidência de conclusão registrada.'));
    card.append(content);list.append(card);
  }
  document.querySelector('#count').textContent=phases.length+' de '+globalThis.productPhases.length+' fases exibidas.';
  if(!phases.length)list.append(element('p','Nenhuma fase encontrada. Limpe os filtros para explorar o produto.','empty'));
}
document.querySelector('#search').addEventListener('input',render);document.querySelector('#status').addEventListener('change',render);addEventListener('hashchange',render);render();
const operations={
  catalog:{implement:['node scripts/local-issue.mjs --repo=lucasnscr/issue-to-pr-ai --issue=NUMERO','Exige issue aberta com ai:ready, engine commitado, GitHub CLI e VM dedicada. O agente não publica a PR.'],validate:['make check\n./mvnw -B -ntp verify','PostgreSQL real via Testcontainers. O controlador também executa critérios HTTP fora do modelo.'],diagnose:['AI_MODE=model\nAI_PROVIDER=ollama\nAI_MODEL=qwen3-coder:30b\nEMBEDDING_PROVIDER=none','Essas variáveis pertencem ao Sentinela que monitora o catálogo, independentemente do agente de implementação.']},
  sentinela:{implement:['npm run implement:issue -- --issue=NUMERO','O entrypoint usa o engine compartilhado por SHA revisado. Não carrega a chave de diagnóstico do .env.local.'],validate:['npm run check\nnpm test\nnpm run test:integration\nnpm run build','Configure um PostgreSQL/pgvector de teste. Alterações de provider/operações/SDLC exigem os E2E correspondentes.'],diagnose:['AI_MODE=model\nAI_PROVIDER=ollama\nAI_MODEL=qwen3-coder:30b\nEMBEDDING_PROVIDER=none','Diagnosticar incidentes e alterar código são fluxos separados. Monitorar o próprio Sentinela exige instância externa.']}
};
for(const project of Object.values(operations))project.github=['# Na issue aberta com ai:ready, comentar:\n/oc\n\n# No host dedicado, manter o provider ativo:\nnode scripts/run-ephemeral-runner.mjs --watch --max-jobs=100','O comando do provider pertence ao checkout issue-to-pr-ai. Exige flags por repositório, VM base preparada e Ollama disponível. A PR permanece draft; o Sentinela usa publisher local após validação hospedada.'];
function operation(){const item=operations[document.querySelector('#project').value][document.querySelector('#operation').value];document.querySelector('#commands').textContent=item[0];document.querySelector('#operation-note').textContent=item[1];}
const scenarios={success:'Issue autorizada → patch → testes independentes → PR draft. Merge, deploy e verificação seguem seus próprios controles.',model:'A execução falha sem publicar. Uso ausente não vira zero; o engine não troca silenciosamente para um provedor de nuvem.',ci:'A validação bloqueia a publicação ou o deploy. O operador revisa o diagnóstico e autoriza uma nova tentativa; a primeira tentativa não vira sucesso.',recovery:'O Sentinela exige telemetria nova, critérios de negócio/dados e estabilidade configurados. Pode indicar regressão e solicitar rollback conforme a política.',rollback:'Confirmação do comando de rollback não comprova saúde. A verificação independente continua e a degradação persistente gera escalonamento.'};
function scenario(){document.querySelector('#scenario-result').textContent=scenarios[document.querySelector('#scenario').value];}
for(const id of ['project','operation'])document.querySelector('#'+id).addEventListener('change',operation);document.querySelector('#scenario').addEventListener('change',scenario);operation();scenario();
