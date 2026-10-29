# Claude Code para o perfil do Sentinela

## 29 de outubro de 2026

- Adicionado workflow reutilizável claude-reusable.yml, com geração hospedada em container Claude Code 2.1.306 e perfil TypeScript explícito.
- A autorização distingue @claude de /oc e vincula agente/modelo à tarefa e ao resultado congelado. Issue aberta, ai:ready, autor humano com escrita e branch padrão continuam obrigatórios.
- No perfil controlado, o Claude edita sem shell, ferramentas de rede, subagentes ou descoberta das configurações do candidato. As regras do alvo são fornecidas explicitamente; leitura externa e alterações em .git/node_modules são recusadas.
- Patch e uso são congelados antes da execução do candidato. Validação independente mantém os perfis Java/TypeScript, sem credenciais de publicação ou inferência.
- O publisher local verifica o workflow Claude, o SHA do engine e o agente do manifesto. O controlador existente reconhece runs Claude e publica sem alocar VM ou consultar Ollama.
- Preservados os caminhos existentes de OpenCode/Ollama e Claude do catálogo Java. O texto da PR identifica o agente/modelo realmente usados.

Configuração e regressões estão descritas em [Claude no Sentinela](../runbooks/sentinela-claude.md). A autorização de merge nesta tarefa foi dada pelo usuário após revisão e testes; o produto continua produzindo PR draft sem aprovar ou integrar o próprio código.

Validação local: 218 testes de scripts/hook; Maven com 2 testes unitários e 83 testes de integração PostgreSQL; actionlint, estrutura, skills e links aprovados. A imagem Claude foi construída e a versão/flags do CLI verificadas. O ciclo integrado com Sentinela passou os sete estágios, incluindo nova tentativa, rollback com/sem recuperação e aprendizado revisado. Geração e testes de política utilizam respostas controladas, sem afirmar uma nova inferência no provedor.
