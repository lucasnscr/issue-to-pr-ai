import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Uses the bundled artifact runtime. Set these paths to the runtime on this machine.
const runtimeModules = process.env.RUNTIME_NODE_MODULES;
const skillDir = process.env.PRESENTATIONS_SKILL_DIR;
const runtimePython = process.env.RUNTIME_PYTHON;
if (!runtimeModules || !skillDir || !runtimePython) throw new Error('Set RUNTIME_NODE_MODULES, PRESENTATIONS_SKILL_DIR and RUNTIME_PYTHON');
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtimeModules, '@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const here = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(await fs.readFile(path.join(here, 'evidence.json'), 'utf8'));
const workspaceDir = process.env.PRESENTATION_BUILD_DIR || '/tmp/issue-to-pr-presentation';
const stagingDir = path.join(workspaceDir, 'build');
const outputDir = path.join(workspaceDir, 'output');
await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
const revision = process.env.PRESENTATION_REVISION || 'v1';
const finalPptx = path.join(outputDir, `issue-to-pr-ai-${revision}.pptx`);
const finalPdf = path.join(outputDir, `issue-to-pr-ai-${revision}.pdf`);
const font = resolvePresentationFont({fontFamily:'Arial'});
const palette = { paper:'#F6F7F8', ink:'#142B45', muted:'#536778', blue:'#005DAA', teal:'#007C83', white:'#FFFFFF', rule:'#CED8E0', amber:'#A25B00' };
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function txt(slide, text, x, y, w, h, size=28, color=palette.ink, bold=false) {
  const shape = slide.shapes.add({ geometry:'textbox', name:text.slice(0,45), position:{left:x,top:y,width:w,height:h}, fill:'none', line:{fill:'none',width:0} });
  shape.text = text;
  shape.text.style = { fontSize:size, typeface:font, color, bold, wrap:'square', autoFit:'none', insets:0, verticalAlignment:'top' };
  return shape;
}
function base(title, number, { dark=false, subtitle }={}) {
  const slide = presentation.slides.add();
  slide.background.fill = dark ? palette.ink : palette.paper;
  if (title) txt(slide,title,72,54,1136,105,46,dark?palette.white:palette.ink,true);
  if (subtitle) txt(slide,subtitle,72,163,1136,50,25,dark?'#BBD3E5':palette.muted);
  txt(slide,`${String(number).padStart(2,'0')} / 12`,1115,665,95,24,16,dark?'#BBD3E5':palette.muted);
  return slide;
}
function table(slide, values, { top=224, height=365, widths, size=25 }={}) {
  const columns = values[0].length;
  const tab = slide.tables.add({rows:values.length,columns,left:72,top,width:1136,height,values,columnWidths:widths});
  tab.styleOptions = {headerRow:true,bandedRows:false};
  tab.borders.assign({fill:palette.rule,width:1,style:'solid'});
  tab.cells.block({row:0,column:0,rowCount:values.length,columnCount:columns}).assign({ fill:palette.paper, textStyle:{fontSize:size,typeface:font,color:palette.ink}, margins:{top:15,bottom:10,left:14,right:14},anchor:'center' });
  tab.cells.block({row:0,column:0,rowCount:1,columnCount:columns}).assign({ fill:palette.ink,textStyle:{fontSize:size,typeface:font,color:palette.white,bold:true} });
  tab.rows[0].height=58;
  return tab;
}
function note(slide, timing, text, sources=[]) {
  slide.speakerNotes.text = `${timing}\n\n${text}\n\nFontes e evidências:\n${sources.join('\n')}`;
}
const src = {
  repo:evidence.repoUrl,
  first:evidence.historical.firstRunUrl,
  pass:evidence.historical.successfulRunUrl,
  pr:evidence.historical.prUrl,
  cursorCLI:'https://cursor.com/docs/cli/headless',
  cursorCI:'https://cursor.com/docs/cli/github-actions',
  cursorCloud:'https://cursor.com/docs/cloud-agent',
  cursorAPI:'https://cursor.com/docs/cloud-agent/api/endpoints',
  cursorPrivacy:'https://cursor.com/data-use',
  cursorSecurity:'https://cursor.com/security'
};

{
  const s=base(null,1,{dark:true});
  txt(s,'issue-to-pr-ai',72,95,1136,110,88,palette.white,true);
  txt(s,'Desenvolvimento com IA\ne validação independente',72,260,1050,150,52,palette.white,true);
  txt(s,'Prova de conceito para equipes de engenharia',72,470,1060,58,27,'#BBD3E5');
  txt(s,'Lucas Silva\n22 de outubro de 2026',72,578,900,58,22,'#BBD3E5');
  note(s,'0:00–0:40','Esta é uma prova de conceito pessoal, com código público e dados fictícios. A proposta é discutir como agentes de código entram em um processo de engenharia com critérios verificáveis. Os casos de uso são sugestões de piloto para avaliação das equipes.',[src.repo]);
}
{
  const s=base('Tarefas pequenas e verificáveis',2);
  txt(s,'Uma issue define o resultado esperado',72,205,1090,72,40,palette.blue,true);
  txt(s,'Filtros de API, testes de regressão, exemplos de uso e manutenção de dependências oferecem escopos delimitados.',72,310,1080,115,32);
  txt(s,'Hipótese do piloto: reduzir esforço repetitivo sem transferir a decisão de entrega ao agente.',72,485,1080,110,32,palette.teal,true);
  note(s,'0:40–1:30','O ganho de produtividade ainda é uma hipótese. Começamos com uma mudança que alguém consegue revisar e com critérios que a automação consegue verificar. Uma tarefa extensa, com regra ambígua ou sem ambiente executável, dificulta atribuir sucesso e custo ao agente. O catálogo serve como laboratório para esse recorte.',[src.repo]);
}
{
  const s=base('Fluxo de implementação e entrega',3,{subtitle:'A publicação depende de evidências produzidas fora da geração'});
  table(s,[['Etapa','Responsável','Evidência'],['Escopo e autorização','Pessoa + gate do workflow','Issue, critérios e permissão'],['Geração da mudança','Agente + modelo','Patch e registro da execução'],['Validação','CI independente','Testes, imagem e HTTP'],['Publicação e decisão','Publisher + pessoa revisora','Draft PR, diff e checks']],{height:370,widths:[335,350,451],size:24});
  note(s,'1:30–2:40','No fluxo controlado, a geração não recebe o token de escrita que publica a PR. O modelo prepara os arquivos. O workflow avalia o escopo e executa testes antes de um job separado publicar o patch. Os comandos /oc e @claude usam CLIs não interativas e o mesmo publisher isolado. Essa garantia depende dos controles do workflow, não somente do prompt. O merge continua uma decisão humana, salvo uma autorização explícita para esta entrega.',[src.repo,src.pass]);
}
{
  const s=base('Aplicação de catálogo',4,{subtitle:'Ambiente de demonstração com produtos fictícios'});
  txt(s,'Swagger e HTTP',72,230,470,65,40,palette.blue,true);
  txt(s,'Cadastro, consulta e filtros',72,310,470,90,29);
  txt(s,'API Java 21 + Spring Boot',610,230,600,65,38,palette.blue,true);
  txt(s,'Validação e contrato OpenAPI\nPostgreSQL + migrations Flyway\nImagem e execução com Docker',610,310,580,165,29);
  txt(s,evidence.current.fullApplication.detail,72,570,1120,65,25,palette.muted);
  note(s,'2:40–3:30','Mostrar primeiro o comportamento observável da aplicação pelo Swagger ou por chamadas HTTP. Esta apresentação enfatiza a API, PostgreSQL e infraestrutura. O diagnóstico histórico validou a API e o banco reais. A demonstração não usa conexões com dados ou sistemas corporativos.',[src.repo,...[evidence.current.fullApplication.url].filter(Boolean)]);
}
{
  const s=base('Os testes bloquearam a primeira tentativa',5,{subtitle:'A segunda tentativa usou instruções corrigidas sobre as falhas'});
  table(s,[['Execução real','Resultado','Publicação'],['Primeira tentativa','6 falhas de integração','Bloqueada'],['Segunda tentativa','28 testes Java + 32 testes Node','Draft PR #3 criada']],{top:242,height:265,widths:[300,530,306],size:27});
  txt(s,'Docker, smoke HTTP e critérios independentes completaram a validação da segunda tentativa.',72,548,1125,80,27,palette.teal,true);
  note(s,'3:30–4:50','A primeira chamada autenticada ao modelo gerou uma implementação, mas seis testes de integração falharam. A pipeline bloqueou a publicação. A análise das falhas gerou instruções corrigidas para a segunda tentativa. A execução seguinte passou e originou a PR #3. Os 60 testes pertencem à CI dessa PR: 28 Java e 32 Node. Isso não mede qualidade universal e não demonstra correção autônoma. O registro histórico levou cerca de seis minutos para geração e validação.',[src.first,src.pass,src.pr]);
}
{
  const s=base('Casos de uso em equipes de engenharia',6,{subtitle:'Hipóteses de piloto em laboratório, sujeitas à avaliação interna'});
  table(s,[['Caso','Exemplo de issue','Aceite verificável'],['Contratos de APIs','Filtro opcional e validação','Compatibilidade + erros + OpenAPI'],['Integrações','Regressão em serialização','Fixture fictícia + teste do defeito'],['Dependências','Atualização de uma biblioteca','Build + testes + análise do diff'],['Documentação','Exemplo de SDK executável','Exemplo validado contra contrato']],{top:223,height:386,widths:[260,430,446],size:24});
  note(s,'4:50–6:10','Equipes que mantêm APIs e integrações podem avaliar tarefas de engenharia com escopo e aceite claros. A tabela contém hipóteses de piloto, sem descrever projetos internos. Para um primeiro piloto, usar repositório de laboratório e dados sintéticos. Precisão de domínio e decisão de entrega continuam com as pessoas responsáveis.',[src.repo]);
}
{
  const s=base('Exemplo de piloto: faixa de preço',7);
  txt(s,'Uma mudança atravessa contrato, API e banco',72,215,1100,80,40,palette.blue,true);
  txt(s,'Limites inclusivos e opcionais\nCombinação com categoria e paginação\nErros claros para intervalo inválido',72,330,1060,180,32);
  txt(s,'Aceite: testes com PostgreSQL real, build Docker e chamadas HTTP independentes.',72,560,1110,70,28,palette.teal,true);
  note(s,'6:10–7:20','A faixa de preço é um exemplo da evolução atual. Mostrar a issue e seus critérios antes de mostrar o código. A comparação usa BigDecimal, os filtros precisam preservar o total e o contrato OpenAPI precisa documentar o comportamento. As regras são do catálogo de laboratório. O resultado da execução aparece no slide de evidências e só deve ser anunciado como concluído quando os links comprovarem o aceite.',[src.repo,...[evidence.current.newFullPr.url].filter(Boolean)]);
}
{
  const s=base('Ferramenta e modelo são escolhas distintas',8);
  table(s,[['Ferramenta','Papel no fluxo','Escolha de inferência'],['OpenCode','CLI em workflow controlado','Provedores configurados'],['Claude Code','CLI em workflow controlado','Modelos compatíveis com a ferramenta'],['Cursor','IDE, CLI ou Cloud Agent','Modelos disponíveis no produto']],{top:226,height:340,widths:[260,420,456],size:26});
  txt(s,'Os critérios de aceite e a CI continuam sob controle do repositório.',72,597,1110,55,28,palette.teal,true);
  note(s,'7:20–8:30','O projeto não exige que a ferramenta seja Claude Code. OpenCode foi a ferramenta do teste histórico, usando um modelo Anthropic. Cursor é outra ferramenta possível. A escolha depende de integração, acesso, operação e termos do provedor. Rodar uma CLI localmente ou em runner próprio não prova que a inferência acontece dentro da organização. O mesmo modelo pode não estar disponível em todos os produtos.',[src.repo,src.cursorCLI,src.cursorCloud]);
}
{
  const s=base('Cursor no mesmo processo de entrega',9,{subtitle:'CLI preserva a separação entre geração, testes e publicação'});
  table(s,[['Opção','Como entra no fluxo','O que avaliar'],['IDE','Pessoa conduz a implementação','Diff, contexto e CI'],['CLI no runner','agent -p com escrita autorizada','Permissões e secret Cursor'],['Cloud Agent','Comentário @cursor ou API','Ambiente, rede e política de dados']],{top:225,height:335,widths:[260,470,406],size:25});
  txt(s,'Alternativa documentada. Teste autenticado ao Cursor depende de credencial própria.',72,593,1130,62,25,palette.muted);
  note(s,'8:30–9:50','A documentação atual do Cursor oferece modo headless e integração com GitHub Actions. O comando é agent, com -p para execução não interativa, e --force permite modificar arquivos. A adaptação proposta manteria a publicação fora do agente. Cloud Agents oferecem outro caminho, com ambientes próprios e integração GitHub/API. Neste repositório, não declaramos um teste autenticado do Cursor sem credencial e execução. Privacy Mode e controles do produto precisam de avaliação interna conforme o contrato e a configuração escolhidos.',[src.cursorCLI,src.cursorCI,src.cursorCloud,src.cursorAPI,src.cursorPrivacy,src.cursorSecurity]);
}
{
  const s=base('Controles para um piloto corporativo',10);
  txt(s,'Acesso e dados',72,214,1120,50,34,palette.blue,true);
  txt(s,'Repositório autorizado, dados sintéticos e credenciais com escopo mínimo',72,275,1115,70,28);
  txt(s,'Entrega e rastreabilidade',72,370,1120,50,34,palette.blue,true);
  txt(s,'PR e checks obrigatórios\nAprovação independente prevista no piloto corporativo',72,431,1115,70,28);
  txt(s,'Consumo e operação',72,526,1120,50,34,palette.blue,true);
  txt(s,'Timeout, tokens reportados e custo estimado',72,587,1115,60,28);
  note(s,'9:50–11:00','Este slide descreve o desenho de um piloto. A main exige PR e checks, inclusive para o administrador. O laboratório tem um mantenedor e zero aprovações adicionais. O usuário autorizou explicitamente estes merges, executados pelo Codex. Isso não representa revisão técnica humana independente. O piloto corporativo precisa configurar responsáveis e aprovação independente. Timeout e número de etapas reduzem execução ilimitada, mas não equivalem a um teto monetário garantido por todos os provedores. Telemetria deve distinguir consumo informado, estimado e indisponível. Ferramentas e políticas de dados precisam de avaliação da organização antes de usar código interno.',[src.repo,src.cursorSecurity]);
}
{
  const s=base('Evidências da evolução atual',11,{subtitle:`Estado registrado em ${evidence.asOf.split('-').reverse().join('/')}`});
  const c=evidence.current;
  table(s,[['Parte','Estado verificável'],['Aplicação completa',c.fullApplication.detail],['Novo teste com PR',c.newFullPr.detail],['Revisão por IA',c.liveReview.detail],['Kubernetes e GPU',c.kubernetes.detail],['Cursor',c.cursor.detail]],{top:220,height:402,widths:[350,786],size:23});
  note(s,'11:00–13:20','Abrir a nova issue, a execução e a PR pelos links do arquivo evidence.json. Mostrar o Swagger e o teste HTTP correspondente. Se algum item continuar pendente, tratar como próximo passo e usar a execução histórica como demonstração de reserva. A API e o PostgreSQL passaram por implantação real em kind. vLLM e ARC permanecem sem execução real, pois o escopo deste laboratório não inclui GPU nem credenciais de GitHub App. O resultado do comando /oc no fluxo controlado é: '+c.nativeOpenCode.detail+'. Claude Code: '+c.nativeClaude.detail+'. Main: '+c.main.detail+'. Governança: '+c.governance.detail+'.',[src.repo,...Object.values(c).map(x=>x.url).filter(Boolean)]);
}
{
  const s=base('Piloto com resultado mensurável',12,{dark:true});
  txt(s,'Uma equipe. Um repositório de laboratório.',72,217,1120,70,38,palette.white,true);
  txt(s,'Proposta: duas semanas e cerca de dez issues pequenas',72,315,1110,80,30,'#BBD3E5');
  txt(s,'Tempo de revisão e intervenções\nFalhas e retrabalho\nFalsos positivos nos comentários da IA\nCusto estimado por tarefa concluída',72,425,1110,150,31,palette.white);
  txt(s,'Escala condicionada às evidências e à avaliação interna',72,610,1110,45,26,'#BBD3E5');
  note(s,'13:20–15:00','A proposta de uma equipe, duas semanas e dez issues é um desenho de piloto, não um resultado. Comparar tarefas equivalentes com e sem agente e registrar falhas, retrabalho, custo e esforço de revisão humana. O objetivo da conversa é escolher um caso pequeno e um responsável pelo piloto. O projeto ainda não fornece evidência para prometer uma porcentagem de ganho de produtividade. Reservar o último minuto para discussão.',[src.repo]);
}

for (const [i,slide] of presentation.slides.items.entries()) {
  const name=`slide-${String(i+1).padStart(2,'0')}.png`;
  const blob=await presentation.export({slide,format:'png',scale:1});
  await fs.writeFile(path.join(stagingDir,name),new Uint8Array(await blob.arrayBuffer()));
}
const candidatePath=path.join(stagingDir,`candidate-${revision}.pptx`);
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const tableOwners=[3,5,6,8,9,11];
await finalizePresentation({
  workspaceDir,candidatePath,finalPath:finalPptx,pythonExecutable:runtimePython,
  integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...tableOwners.flatMap(n=>['--require-native-table-slide',String(n)])],
  explicitTotalSlideCount:12,requiredNativeTableOwnerSlides:tableOwners,requiredNativeChartOwnerSlides:[],
  fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,
  receiptPath:path.join(stagingDir,`validation-${revision}.json`)
});
const notes=['# Roteiro de apresentação, 15 minutos','',...presentation.slides.items.flatMap((s,i)=>[`## Slide ${i+1}`,'',s.speakerNotes.text,''])].join('\n');
await fs.writeFile(path.join(outputDir,`roteiro-${revision}.md`),notes);
try {
  const pdf=await presentation.export({format:'pdf'});
  await fs.writeFile(finalPdf,new Uint8Array(await pdf.arrayBuffer()));
} catch {
  // Projection backup preserves the reviewed slide rendering. PPTX stays fully editable.
  const {PDFDocument}=await import(pathToFileURL(path.join(runtimeModules,'pdf-lib/cjs/index.js')).href);
  const pdf=await PDFDocument.create();
  pdf.setTitle('issue-to-pr-ai: desenvolvimento com IA e validação independente');
  pdf.setAuthor('Lucas Silva');
  for(let i=0;i<presentation.slides.items.length;i++) {
    const png=await fs.readFile(path.join(stagingDir,`slide-${String(i+1).padStart(2,'0')}.png`));
    const image=await pdf.embedPng(png);
    const page=pdf.addPage([960,540]);
    page.drawImage(image,{x:0,y:0,width:960,height:540});
  }
  await fs.writeFile(finalPdf,await pdf.save());
}
console.log(JSON.stringify({pptx:finalPptx,pdf:finalPdf,notes:path.join(outputDir,`roteiro-${revision}.md`),font,slideCount:presentation.slides.items.length}));
