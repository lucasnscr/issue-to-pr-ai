# Integração local do OpenCode com Ollama

## Fase 1 — validada em 29/10/2026

- Preflight com identidade do modelo, contexto efetivo e duas chamadas nativas de ferramentas vinculadas por receipt sintético.
- Erros explícitos para endpoint, modelo, ferramentas, contexto e tokens inválidos.
- Relatório agregado sem prompts, respostas, raciocínio ou credenciais.
- Documentação interativa com busca, filtros, expansão por fase, critérios e evidências.
- O preflight nativo não comprova edição pelo OpenCode nem conclusão de uma issue.

Validação: 199 testes de scripts; Maven com 2 testes unitários e 82 de integração PostgreSQL, todos aprovados. Qwen real com 64.000 tokens de contexto, ferramentas nativas em 7,42 s. OpenCode 1.19.3 executado em container descartável não privilegiado, editando apenas fixture sintética, com 3 etapas e telemetria completa. Não habilita automação.

Revisão: endpoint sem credenciais/query/redirect; respostas limitadas; fixture com receipt imprevisível; sem home ou socket Docker montados. Metadados de memória são do modelo, não pico do processo. A validação visual via navegador ficou indisponível porque o uso de navegador local está desabilitado nas configurações do aplicativo.

Execute a documentação com `node scripts/serve-product-docs.mjs` e abra http://127.0.0.1:4330/.

## Fase 2 — validada em 29/10/2026

- Adaptador Ollama explícito, tags estritas e allowlist de implementação.
- Resolução de credencial independente; chaves de nuvem removidas do ambiente de inferência local. Gateway remoto exige HTTPS e credencial própria.
- Preflight OpenCode passa pelo wrapper governado real, com 3 etapas, 10.085 unidades de tokens e decisão allow.
- Regressão: 202 testes de scripts, make check e Maven (2 unitários, 82 de integração PostgreSQL), sem falhas. Testes de política preservam bloqueio com uso ausente, limites excedidos, erro de provedor e modelo não permitido.
- Revisão: tag não admite comandos ou múltiplos dois-pontos; configuração referencia a variável de credencial. Sem fallback para nuvem.
- Infraestrutura preparada para o piloto: Lima 2.2.1, VM Linux com mounts vazios, Docker 29.9.2, Java 21 e Node 24.21.0. Não é runner GitHub habilitado.
- Documento interativo: busca, filtro de estado e ausência de resultados validados com DOM emulado. Revisão visual continua indisponível no navegador local.

## Fase 3 — validada localmente em 29/10/2026

- Controlador local separado do modelo; VM sem mounts do host; código de engine vinculado a commit; perfil Java e permissões de edição sem comandos.
- Publicação só após escopo, uso, regressão PostgreSQL e aceitação HTTP independentes. Revalida issue/base/autorização; limpa recursos do job.
- 204 testes de scripts e regressão Maven do engine aprovados. Piloto de código em execução.
- Primeira tentativa não publicou. Inclusão explícita do README da aplicação no perfil foi revisada e testada. A tentativa seguinte passou em Maven/HTTP e abriu PR #77, mas a revisão encontrou documentação incompleta e a PR foi fechada. Outra tentativa foi bloqueada pela compilação (import UUID ausente), sem publicação. Feedback registrado nos critérios e nova execução em temperatura zero. Nenhuma edição de código do piloto foi feita por outro modelo.

Conclusão do piloto: PR #78 gerada pelo Qwen após retomada explícita da PR #77 revisada. A retomada final usou 10 etapas e 79.906 unidades de tokens. Maven/PostgreSQL, smoke, categorias, preço, ordenação e no-store independente passaram. Diff revisado: cabeçalho, teste IT, descrição OpenAPI e README presentes; sem edição de código da aplicação por outro modelo. Uma retomada intermediária falhou no escopo e não publicou. Duas tentativas de implementação do zero falharam na compilação (UUID e CacheControl), sem publicação. Os testes mostraram que inferência concluída não implica código correto; o aceite depende da validação e da revisão.

As PRs #78 e #79 concluíram CI e foram integradas à main; a combinação final passou novamente em scripts e Maven/PostgreSQL. A VM de laboratório permanece dedicada e será tratada separadamente da validação do runner descartável.

## Fase 4 — validada localmente em 29/10/2026

- Perfil sentinela-typescript e validador Node24/PostgreSQL/pgvector/check/build/E2E, preservando o perfil Java.
- Relatórios fora do checkout, sem depender de gitignore do repositório chamador. Patch deve permanecer idêntico após os testes para ser publicado.
- Regressão do engine: 205 testes de scripts, make check e Maven/PostgreSQL aprovados.
- Primeiro piloto TypeScript compilou e passou nos testes unitários, mas detectou fixture SDLC antiga dependente de 1 ms. A base foi corrigida em PR própria do Sentinela, sem alterar produção ou editar o patch de aplicação gerado pelo Qwen. Nova execução do piloto pendente.

Conclusão local: entrypoint do Sentinela invocou o engine imutável 42f4df9; o Qwen implementou #16 e abriu PR #18, com 10 etapas e 101.726 unidades de tokens. Check/unidade/40 integrações/build/E2E providers-operações passaram na VM e o patch permaneceu idêntico após testes. Critério independente de timeout: 18 verificações, vermelho na base anterior e verde no código Qwen. A revisão desta execução corrigiu somente a formatação da tabela Markdown; código e teste do piloto permaneceram gerados pelo Qwen.

Teste conjunto SDLC também aprovado localmente contra as versões atuais dos dois repositórios; GitHub e agente desse teste são controlados. Isso é evidência distinta dos pilotos com inferência real. Infraestrutura Sentinela #17 integrada após CI conjunta; PR de aplicação #18 e engine #81 aguardam seus checks finais para merge. A documentação interativa ganhou receitas por projeto e cenários de falha, validados em DOM emulado.
