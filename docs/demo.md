# Demonstração de 15 minutos

Use apenas o catálogo público com dados fictícios. As sugestões para B3 são propostas para discussão, sem aprovação ou implantação interna.

## Preparação

- Confira CI da `main`, credencial válida e limites em `config/ai-policy.json`.
- Separe os links da issue, execução, artefatos, draft PR e comentário de revisão.
- Inicie `docker compose up --build -d` e abra `/swagger-ui.html`.
- Tenha o PDF da apresentação e uma gravação/evidência de execução pronta.
- Uma geração real pode levar vários minutos. Dispare no início e use a execução concluída como reserva.

## Roteiro

| Tempo | Conteúdo |
|---|---|
| 0–2 min | Uma issue com critérios de aceite e escopo pequeno |
| 2–5 min | Gate de permissão, inferência sem token de publicação e validação independente |
| 5–8 min | Primeira tentativa histórica bloqueada pelos testes e segunda tentativa guiada aprovada |
| 8–11 min | API completa com PostgreSQL/Docker, PR e revisão consultiva vinculada ao SHA |
| 11–13 min | Casos propostos B3 e Cursor como opção de agente |
| 13–15 min | Limites, custo estimado, piloto e perguntas |

O escopo completo é API, banco e infraestrutura, sem interface web própria. O Swagger é o explorador da API.
O teste Kubernetes local inclui persistência após recriar o Pod. vLLM/ARC continuam dependentes de GPU e credenciais apropriadas.

## Tarefa nova

Categoria, faixa de preço e ordenação já foram implementadas. Use suas execuções concluídas
como evidência. Para uma tarefa nova ao vivo, há o exercício opcional de
[listar categorias](demo-issues/04-list-categories.md), ainda não implementado.
Não repita issues cujo aceite já esteja atendido na base.
Na issue autorizada comente `/oc implemente esta issue` ou `@claude implemente esta issue`.
A PR só aparece após os testes. A IA não decide o merge.

## Comandos da aplicação

```sh
node scripts/smoke.mjs
node scripts/category-acceptance.mjs
# Depois de integrar a funcionalidade de faixa de preço:
node scripts/price-acceptance.mjs
```

Mostre o artefato `ai-usage.json`: tokens por dimensão, custo estimado, limites e decisão de política.
Não apresente estimativa como fatura nem generalize um resultado para ganho de produtividade.
Escolha tarefas comparáveis para medir tempo total, intervenção humana, falhas e consumo em um piloto.
