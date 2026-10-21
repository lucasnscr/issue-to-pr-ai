# Demonstração reproduzível

## Estado inicial

O CRUD, a validação de preço e SKU e a paginação já estão implementados e testados.
As três issues abaixo são exercícios incrementais, ainda não implementados na aplicação base.
Elas permitem observar o processo de desenvolvimento por IA com critérios verificáveis.

Prévia local, sem chamadas ao GitHub:

```sh
node scripts/seed-demo-issues.mjs
```

Depois de publicar o repositório e autenticar o GitHub CLI, crie os exercícios:

```sh
node scripts/seed-demo-issues.mjs --create --repo OWNER/REPOSITORY
```

O script cria a label e as issues ausentes, sem adicionar a label às tarefas nem iniciar agentes.
Ele evita duplicar títulos entre as primeiras mil issues retornadas pelo GitHub.

## Roteiro

1. Rode `./mvnw verify` e confira a CI inicial.
2. Abra a primeira issue, revise o escopo e adicione `ai:ready`.
3. Comente `/oc implemente esta issue e entregue uma PR em draft com testes`.
4. Inspecione a branch e a PR, os testes novos, o resumo da Action e os artefatos JSON.
5. Se a PR não estiver em draft, marque-a como draft antes de revisar.
6. Autorize a execução da CI caso o GitHub peça aprovação para workflows criados pelo bot.
7. Marque a PR como pronta para iniciar a revisão por IA, quando habilitada.
8. Faça a revisão humana e o merge após todos os critérios serem atendidos.
9. Use `@claude` em outro exercício, ou configure `vllm/qwen-coder`, para experimentar outra execução.

Executar tarefas diferentes ajuda a conhecer as integrações, mas não constitui uma comparação
controlada entre modelos. Para comparar a mesma tarefa, use cópias do mesmo commit inicial,
os mesmos critérios e os mesmos testes; registre agente/modelo, duração, resultados e intervenção humana.

## Evidências esperadas

- Issue com critérios de aceite e link para a PR.
- PR com mudanças delimitadas e testes que comprovem o comportamento solicitado.
- Checks `Repository checks` e `Build and tests` concluídos.
- Comentário de revisão associado ao SHA atual quando revisão por IA estiver ativada.
- JSON de execução com resultado do agente e dos testes, sem estimativas inventadas de custo.
