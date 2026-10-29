const guide=globalThis.productGuide;
const make=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
const steps=document.querySelector('#lifecycle-steps');
function showStage(index){
  const stage=guide.stages[index],body=document.querySelector('#lifecycle-detail');
  body.replaceChildren(make('h3',(index+1)+'. '+stage.title));
  const dl=document.createElement('dl');
  for(const [key,label] of [['actor','Responsável'],['input','Entrada'],['output','Saída'],['gate','Condição para avançar'],['failure','Se falhar']])dl.append(make('dt',label),make('dd',stage[key]));
  body.append(dl);[...steps.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
}
guide.stages.forEach((stage,index)=>{const button=make('button',(index+1)+'. '+stage.title);button.type='button';button.setAttribute('aria-controls','lifecycle-detail');button.addEventListener('click',()=>showStage(index));steps.append(button);});showStage(0);
function showRuntime(){
  const runtime=guide.runtimes[document.querySelector('#runtime').value],body=document.querySelector('#runtime-detail');
  body.replaceChildren(make('h3',runtime.title));
  for(const [key,label] of [['observes','Observa'],['actions','Ajustes'],['limits','Limites']])body.append(make('h4',label),make('p',runtime[key]));
  body.append(make('pre',runtime.config));
  const link=make('a','Abrir configuração e permissões');link.href=runtime.link;body.append(link);
}
document.querySelector('#runtime').addEventListener('change',showRuntime);showRuntime();
const chapters=document.querySelector('#chapters');
for(const chapter of guide.chapters){const card=document.createElement('details');card.append(make('summary',chapter.title),make('p',chapter.text));const link=make('a','Consultar runbook');link.href=chapter.url;card.append(link);chapters.append(card);}
