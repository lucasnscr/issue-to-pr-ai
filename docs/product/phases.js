globalThis.productPhases = [
  {id:1,title:'Compatibilidade real e dimensionamento',status:'passed',
    description:'Preflight nativo do Qwen/Ollama, contexto efetivo, chamadas de ferramentas e uso registrado sem conteúdo bruto.',
    changes:['Modelo inicial: qwen3-coder:30b.','Contexto mínimo de 64 mil tokens, conferido no runtime.','Ferramentas sintéticas com receipt vinculando leitura e alteração.'],
    acceptance:['Regressão de scripts e Maven com PostgreSQL.','Preflight real e relatório sanitizado.','OpenCode em ambiente isolado validado separadamente do protocolo nativo.'],
    evidence:[{text:'29/10/2026: 199 testes de scripts; Maven com 2 testes unitários e 82 de integração, sem falhas.'},{text:'Qwen real: 64.000 tokens de contexto, 24,94 GB alocados no acelerador; duas ferramentas válidas em 7,42 s.'},{text:'OpenCode 1.19.3 em container descartável: edição sintética concluída, 3 etapas, uso completo. Não comprova implementação de aplicação.',url:'https://github.com/lucasnscr/issue-to-pr-ai/issues/71'}]},
  {id:2,title:'Provedor Ollama e governança',status:'planned',description:'Modelo local com allowlist, credenciais apropriadas, tokens e limites de execução.',changes:[],acceptance:['Execução real do wrapper e regressão dos provedores existentes.'],evidence:[]},
  {id:3,title:'Perfis de aplicação e piloto Java',status:'planned',description:'Uma issue real do catálogo implementada por Qwen e validada independentemente.',changes:[],acceptance:['PR draft com testes PostgreSQL e aceitação HTTP.'],evidence:[]},
  {id:4,title:'Implementação de issues do Sentinela',status:'planned',description:'Perfil Next.js/TypeScript com publicação no repositório chamador.',changes:[],acceptance:['Issue real, regressão TypeScript/PostgreSQL e build.'],evidence:[]},
  {id:5,title:'Automação GitHub com inferência privada',status:'planned',description:'Autorização antes da execução, runner descartável e publicação separada.',changes:[],acceptance:['Execução por comentário nos dois repositórios e descarte confirmado.'],evidence:[]},
  {id:6,title:'Ciclo integrado e liberação gradual',status:'planned',description:'Incidente, correção por Qwen, PR, deploy e recuperação verificada.',changes:[],acceptance:['Pilotos reais e regressão SDLC, incluindo falhas e rollback.'],evidence:[]}
];
