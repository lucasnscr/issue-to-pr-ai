# Executar @claude nas issues do Sentinela

O gatilho @claude usa Claude Code 2.1.306 e um modelo Anthropic permitido pela política de implementação. /oc continua usando OpenCode/Ollama quando LOCAL_AI_ENABLED=true. A configuração de diagnóstico e embeddings do Sentinela permanece independente.

No repositório Sentinela, configure o secret ANTHROPIC_API_KEY, AI_ENABLED=true e CLAUDE_ENABLED=true. CLAUDE_MODEL é opcional e usa anthropic/claude-sonnet-4-6 por padrão. Um modelo fora de config/ai-policy.json é recusado. Nunca forneça credenciais na issue ou no comentário.

O mantenedor prepara uma issue aberta, com critérios de aceite e ai:ready, e comenta @claude. Somente colaborador com escrita pode iniciar o fluxo. Comentários /oc não liberam uma execução Claude; @claude não libera inferência Ollama.

## Geração, validação e publicação

O workflow fino do Sentinela fixa este engine por SHA revisado. A autorização usa a branch padrão e confere issue/permissão/base novamente antes da geração. Claude recebe instruções do perfil sentinela-typescript e AGENTS.md do alvo. O container não recebe token GitHub, home do usuário ou socket Docker. Ferramentas de shell e descoberta das configurações do candidato ficam desabilitadas; a chave Anthropic só é fornecida ao container de geração.

O patch e a telemetria são congelados. Outro job aplica o patch na base autorizada e executa check, testes unitários, PostgreSQL/pgvector, build e E2Es de provedores/operação. Esses testes executam código candidato sem credenciais de publicação/inferência. Falha, consumo incompleto ou troca de agente/modelo bloqueiam publicação.

A restrição do Sentinela que impede Actions de criar/aprovar PRs permanece preservada. O mesmo controlador local já usado para Ollama reconhece a execução Claude e aguarda os jobs confiáveis:

```sh
node scripts/run-ephemeral-runner.mjs \
  --repos=lucasnscr/sentinela --watch --max-jobs=100
```

Execute a partir do checkout revisado deste engine. O processo requer GitHub CLI autenticada com escrita, mas o caminho Claude não inicia VM nem usa Ollama. Mantenha somente um controlador ativo. Sem publisher online, o recibo expira e a entrega fica incompleta; não há troca automática para outro provedor. O controlador pode continuar atendendo /oc com as VMs já configuradas.

O publisher baixa somente artefatos da execução e do workflow esperados, confere o engine referenciado e o agente, revalida a issue/base e publica a PR draft. Não executa o candidato no host. A credencial local mantém os escopos existentes do operador; produção exige identidade de serviço apropriada.

Revisão, merge, deploy e verificação de recuperação continuam separados. Desabilitar CLAUDE_ENABLED impede novas execuções Claude sem desabilitar o caminho local; AI_ENABLED=false suspende novas implementações.

## Regressão

Os testes de autorização cobrem ausência de label, issue fechada/PR, permissão insuficiente, bot, ator divergente e branch incorreta. Resultados congelados cobrem troca de agente/modelo, uso incompleto, orçamento excedido, patch adulterado e tentativa divergente. As suítes existentes de OpenCode e Claude do catálogo continuam obrigatórias.

As regressões controladas não comprovam acesso a uma conta Anthropic nem qualidade geral do modelo. Uma execução real exige secret válido, modelo disponível e orçamento; preserve seu manifesto/uso e valide o patch antes de qualquer entrega.
