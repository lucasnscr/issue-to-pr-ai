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

Teste conjunto SDLC também aprovado localmente contra as versões atuais dos dois repositórios; GitHub e agente desse teste são controlados. Isso é evidência distinta dos pilotos com inferência real. Infraestrutura Sentinela #17, aplicação #18 e engine #81 integrados após os checks finais. A documentação interativa ganhou receitas por projeto e cenários de falha, validados em DOM emulado.

## Fase 5 — em validação

- Workflow reutilizável separa autorização, modelo sem credencial de publicação, artefato congelado, validação hospedada e publisher. Caller/branch/engine imutável são conferidos antes do checkout.
- Provider clona VM sem home, registra runner efêmero com label por run e remove VM/registro após a geração. Runner oficial 2.338.2 fixado por SHA-256.
- Gateway de loopback autenticado e limitado a endpoints/modelo; callbacks de falha reconhecem o novo job sem aceitar nomes arbitrários.
- O modo local impede duplicar /oc no executor legado e preserva seleção explícita @claude.
- Sentinela mantém a configuração can_approve_pull_request_reviews=false: publisher local com sessão gh existente, separado do modelo e após validação hospedada; recibo obrigatório de PR em job somente leitura.
- Regressão: 208 testes de scripts, configuração/actionlint, make check e Maven/PostgreSQL. Clone Linux real com Node24 sem home montado, preflight Qwen real autenticado em contexto64k e remoção da VM verificados.
- Flags locais foram habilitadas após integrar a infraestrutura. As execuções e os limites observados estão registrados abaixo.

Ajuste de isolamento antes dos pilotos GitHub: formatter e LSP automáticos ficam desabilitados no editor controlado (schema OpenCode1.19.3 conferido em container), mantendo somente leitura/edição antes do congelamento. Publisher local usa os eventos normais de PR; somente GITHUB_TOKEN exige dispatch explícito de CI, evitando duplicação no Sentinela.

Pilotos reais aprovados:

- Catálogo: [run 40931294568](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/40931294568), tentativa 2, 47 segundos, 18 etapas e 196.677 unidades de política. Qwen produziu cabeçalho nosniff, regressão e documentação. Validação hospedada e PR #87 aprovadas. A primeira execução parou por HTTP 502 do Maven Central; não publicou.
- Sentinela: [run 40932140979](https://github.com/lucasnscr/sentinela/actions/runs/40932140979), tentativa 3, 179 segundos, 20 etapas e 285.436 unidades. Geração, validação hospedada e recibo do publisher local passaram; VM e registro removidos. Tentativa 1 cancelada deliberadamente sem PR. Tentativa 2 bloqueada por erro TypeScript no teste gerado. Após publicar #23, a revisão corrigiu testes duplicados, acrescentou identity/embeddingSpace e restaurou documentação. Essa intervenção foi do mantenedor/Codex; código de produção permaneceu Qwen. CI final normal e conjunta passaram antes do merge.
- CI nativa do catálogo expôs fixture antiga que fixava a tentativa do worker em 1. PR #88 corrigiu somente a fixture, com reprodução vermelha/verde em GITHUB_RUN_ATTEMPT=2 e 208 testes aprovados. A atualização revisada da base da PR #87 não alterou o patch da aplicação Qwen.
- Reinício real da VM em [run 40945210010](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/40945210010) revelou que HTTP 422 ao excluir runner ocupado impedia apagar a VM. PR #90 destrói/verifica o disco local antes da reconciliação remota. Dois testes novos cobrem runner ocupado e GitHub indisponível; regressão de 210 scripts, make check e Maven/PostgreSQL aprovados. O GitHub mantém o registro ocupado durante o cancelamento por vários minutos; a reconciliação tem prazo limitado de seis minutos por chamada e registra cleanup-incomplete se não puder confirmar a remoção. A repetição final do reinício permanece em validação antes do merge.

## Fase 6 — resultados do ciclo integrado em 29/10/2026

- Laboratório optativo no Sentinela detectou HTTP 503 de uma política sintética de ingresso e publicou issue #85 sem ai:ready. Após revisão, Qwen abriu PR #87; CI e revisão precederam o merge. Deploy Docker do SHA 6b6e1e9b5285a9939149d91942c4479c60ac2789, digest sha256:25e28fe7b873ccb6b03cd93335b7a455ce26d3c3d92171d1a8c3b9acba4842f1, chegou a verified com seis amostras novas e 5.005 ms de estabilidade, incluindo negócio/dados.
- O processo do laboratório foi interrompido durante a pausa da sessão. A retomada preservou caso e issue do PostgreSQL e recriou somente os processos locais/credenciais em memória. Não publicou outra issue. O verificador conferiu a árvore final como o patch congelado aplicado à base revisada, sem executar código candidato no publisher.
- Real: GitHub, modelo, CI, revisão/merge, Java HTTP, PostgreSQL, Docker, callbacks e probes. Controlado: política sintética de ingresso e adaptador do protocolo Prometheus baseado em probes HTTP, com saturação fixada em zero. Diagnóstico por regras. Isso não valida um servidor Prometheus, conta Azure, cluster ou escala de produção.
- Suíte conjunta determinística aprovada novamente contra os dois checkouts atuais: gate antes do merge, dados errados com HTTP 200, métricas congeladas, recuperação após rollback, rollback ainda degradado com escalonamento, segunda tentativa/PR, CI falha/retoma, evento antigo recusado, PR encerrada e aprendizado revisado com teste vermelho/verde. GitHub e resposta do agente dessa suíte são controlados e não contam como inferência real.
- Regressão final do Sentinela: check, 83 testes unitários, 40 PostgreSQL/pgvector e build aprovados. CI do engine executa os 210 testes de scripts e Maven (2 unitários/83 integrações PostgreSQL), além de HTTP.
- Documento interativo ampliado com etapas/atores/condições de avanço, ambientes Kubernetes/Azure/HTTP, operação por repositório, cenários de falha, decisões e evidências. Exportação em um HTML sem CDN. Interações validadas em DOM emulado; revisão visual por navegador permaneceu indisponível neste ambiente.
- Flags AI_ENABLED/LOCAL_AI_ENABLED ativas nos dois repositórios. O provider precisa estar online; nenhum serviço de boot foi instalado. A desativação completa usa AI_ENABLED=false; LOCAL_AI_ENABLED=false isoladamente devolve /oc ao caminho legado. Não houve ativação de ajustes de produção nem deploy em Azure/Kubernetes reais.
