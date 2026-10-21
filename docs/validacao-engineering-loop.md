# Validação real do engineering loop

Laboratório executado em **21/10/2026** no repositório `lucasnscr/issue-to-pr-ai`, com
OpenCode `1.19.3`, modelo `anthropic/claude-sonnet-4-6`, GitHub Actions e PostgreSQL real.

A [issue #31](https://github.com/lucasnscr/issue-to-pr-ai/issues/31) definiu o contrato de
`GET /api/products/categories` e os critérios do laboratório. A candidata da
[PR #32](https://github.com/lucasnscr/issue-to-pr-ai/pull/32) foi preparada pelo Codex com
um defeito controlado: consultar somente os primeiros 20 produtos antes de extrair as categorias.
O teste cobre **PR → revisão real → correção → testes → push na mesma PR → nova revisão**.
A implementação inicial a partir do comando na issue não foi repetida neste laboratório.

## Preparação e intervenção inicial

O ciclo entrou na `main` pela [PR #29](https://github.com/lucasnscr/issue-to-pr-ai/pull/29).
A primeira revisão encontrou o truncamento, mas atribuiu P0 e alegou incorretamente que
a entidade não normalizava categorias. A execução de acompanhamento tentou registrar a
parada e recebeu HTTP 403 ao comentar na PR. Nenhuma tentativa de correção foi reservada
nessa execução.

A [PR #34](https://github.com/lucasnscr/issue-to-pr-ai/pull/34) corrigiu as permissões dos
jobs de acompanhamento e incluiu a entidade/DTO da base confiável no contexto do revisor,
além de explicitar a definição de severidade. Após a CI aprovada e a integração dessa PR,
a branch de laboratório recebeu a `main` por merge normal. Uma nova revisão avaliou o
novo SHA. O parecer original continua disponível no histórico.

## Execuções com o provedor

Os custos abaixo são **estimativas do runtime**, sem confirmação do faturamento do provedor.

| Etapa | Execução | Resultado | Estimativa USD |
|---|---|---|---:|
| Revisão inicial, antes da PR #34 | [39627364254](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39627364254) | Defeito encontrado, com falsos positivos de normalização | 0.03552150 |
| Revisão do SHA `1366d3c09a8e` | [39645980170](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39645980170) | Um achado P1 sobre o limite de 20 produtos | 0.02972775 |
| Correção 1 | [39646070822](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39646070822) | Consulta distinta no banco e teste HTTP com 21 categorias; validação e push aprovados | 0.14252805 |
| Revisão do SHA `307d4130354a` | [39646817951](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39646817951) | Achado P2 sobre categorias gravadas diretamente no banco | 0.03695775 |
| Correção 2 | [39646931235](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39646931235) | Normalização também na consulta e regressão com dados inseridos via JDBC; validação e push aprovados | 0.25282215 |
| Revisão do SHA `5caf62fb24f9` | [39647663402](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39647663402) | Dois achados especulativos, avaliados abaixo | 0.04171650 |

Total estimado das seis chamadas: **USD 0.53927370**. O acompanhamento registra
USD 0.50375220 a partir da revisão posterior à PR #34; a primeira revisão acrescenta
USD 0.03552150. As duas correções usaram respectivamente 10 e 15 etapas, com telemetria
completa e decisão de política `allow`.

Os commits `307d4130354ac726781ba9a658822638589189a0` e
`5caf62fb24f9088c4b3580209a1d29eaf6878916` foram publicados por `github-actions[bot]` na
mesma branch da PR, depois da validação, por um runner separado do agente.

## Provas de comportamento

- **HTTP e PostgreSQL em Docker:** um catálogo isolado com 26 produtos, 25 em `books`
  e um em `tech`, retornou apenas `["books"]` na candidata inicial. Com a primeira
  correção e o mesmo banco, retornou `["books", "tech"]`. Excluir o último produto de
  `tech` removeu essa categoria; excluir os demais retornou `[]`. Os dados eram sintéticos
  e foram removidos ao terminar a prova.
- **Regressão da paginação:** mantendo o teste escrito pelo agente, restaurar temporariamente
  o serviço defeituoso produziu exatamente uma falha: esperadas 21 categorias, recebidas 20.
  O código corrigido foi restaurado antes da verificação completa.
- **Regressão de dados fora da entidade:** mantendo o segundo teste do agente, restaurar
  a consulta anterior produziu uma falha ao receber variantes de `Tech` e espaços como
  categorias distintas. A consulta com `LOWER(TRIM(...))` passou no PostgreSQL.
- **HTTP do último commit:** outro teste com 30 produtos (26 criados pela API e quatro
  inseridos por SQL no banco isolado) retornou `["books", "tech"]`, deduplicando variantes
  de caixa e espaços. O filtro existente, a exclusão da última ocorrência e o catálogo
  vazio também passaram; os 30 registros sintéticos foram removidos.
- **Aplicação completa:** cada correção executou Maven, construção da imagem, inicialização
  com PostgreSQL e os testes HTTP independentes de CRUD, categorias, preço e ordenação.
- **CI do último commit da aplicação:** a [execução 39647660955](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39647660955)
  passou em **84 testes Java** (2 unitários e 82 de integração), sem falhas ou testes
  ignorados, além de **97 testes Node**, validação de configuração, lint e aceitação HTTP.

Os testes de integração de categorias cobrem catálogo vazio, normalização/deduplicação,
ordenação, exclusão da última ocorrência, mais de uma página de produtos e dados inseridos
diretamente no PostgreSQL. A consulta final retorna somente as categorias distintas e
normalizadas, sem carregar todas as entidades de produto em memória.

## Parada e triagem da última revisão

A [execução 39647775498](https://github.com/lucasnscr/issue-to-pr-ai/actions/runs/39647775498)
registrou **`needs-human`**, com **2/2 tentativas** e reserva de **USD 9/9**. Ela concluiu
com sucesso técnico porque registrou a parada prevista; isso não significa aprovação da PR.
O [comentário de acompanhamento](https://github.com/lucasnscr/issue-to-pr-ai/pull/32#issuecomment-6322578307)
preserva esse resultado. A autorização `ai:autofix` foi removida da PR ao encerrar o teste.

A triagem assistida pelo Codex considerou os dois últimos achados não acionáveis para o
contrato e a infraestrutura atuais:

1. **P2 sobre outro provedor JPA futuro:** a expressão de ordenação é a mesma expressão
   selecionada pela consulta. O próprio parecer reconhece o funcionamento com Hibernate e
   PostgreSQL; a integração HTTP executa essa consulta no banco real. A troca hipotética de
   provedor está fora do escopo e não demonstra falha da aplicação atual.
2. **P3 sobre `description` tornar-se obrigatório no futuro:** o campo é opcional no DTO,
   a entidade trata `null`, e a requisição do teste omite a chave sem inserir `null` no
   `Map.of`. O parecer reconhece que isso é válido. Uma mudança futura no contrato não é
   um defeito presente.

O teste demonstrou duas correções reais, publicação isolada, revalidação e parada por limite.
Também demonstrou a necessidade de avaliar os pareceres: **esta execução não terminou
automaticamente em `ready-for-human`**. A integração é uma decisão sob autorização do
mantenedor, com a triagem acima e a CI aprovada. Os pareceres e o estado do bot permanecem
como evidência, com suas referências aos respectivos SHAs.

O [guia operacional](engineering-loop.md) descreve como repetir o ciclo em outra tarefa,
com uma nova autorização e os limites próprios daquela PR.
