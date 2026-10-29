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
