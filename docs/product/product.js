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
