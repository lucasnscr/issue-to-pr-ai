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
