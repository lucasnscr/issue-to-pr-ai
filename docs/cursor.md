# Cursor como alternativa ao Claude Code

O editor Cursor, o Cursor CLI, o OpenCode e o Claude Code são ferramentas de desenvolvimento.
O modelo é uma escolha separada, sujeita ao que cada ferramenta e contrato disponibilizam.
Executar o Cursor no computador ou em um runner próprio não torna a inferência local.

## Opção recomendada para este template

O **Cursor CLI em um job de geração** pode ocupar o lugar do executor OpenCode/Claude Code.
Mantemos fora do agente a autorização da issue, a validação dos arquivos alterados, os testes,
o build da imagem e a publicação da draft PR. Essa separação é uma proposta de integração,
sem afirmar que o repositório já executou uma chamada autenticada ao Cursor.

O comando atual na documentação oficial é `agent`. O modo não interativo usa `-p`.
A escrita direta requer `--force`, que também amplia a autonomia de execução.
A autenticação de automação usa `CURSOR_API_KEY` em GitHub Secrets.
Exemplo conceitual, a executar somente em um ambiente descartável com escopo restrito:

```sh
agent -p --force --output-format json \
  "Leia AGENTS.md e a issue aprovada. Altere apenas a aplicação, testes e documentação. Não execute git, gh, push nem publique comentários."
```

O prompt não representa uma fronteira de segurança. A adaptação precisa configurar as permissões
do CLI, impedir acesso ao token GitHub de escrita durante a geração e validar o patch antes da publicação.
Em CI, fixe uma versão aprovada do CLI em vez de depender de um instalador mutável a cada execução.
Os mesmos testes independentes devem valer para qualquer ferramenta.

## Outros caminhos

| Caminho | Uso sugerido | Integração a validar |
|---|---|---|
| Cursor IDE | Desenvolvedor conduz a tarefa, revisa o diff e publica a branch | CI e revisão humana continuam no GitHub |
| Cursor CLI | GitHub Actions ou runner da organização executa uma issue aprovada | Secret, permissões, formato de saída e limites de execução |
| Cursor Cloud Agents | Agente remoto recebe tarefa por GitHub ou API | Conexão da organização, ambientes, repositórios e políticas de dados |

Os Cloud Agents podem partir de comentários `@cursor` e da API. A API atual documenta criação
em `POST /v1/agents`, `repos[].startingRef`, `autoCreatePR` e `workOnCurrentBranch`.
Para uma integração futura, mantenha `workOnCurrentBranch=false` e confira que a PR fica em draft.
O caminho Cloud tem seu próprio ambiente de execução. Ele exige uma avaliação separada do caminho CLI.

## Dados e operação

O Cursor publica Privacy Mode e controles de rede/segredos para Cloud Agents.
Privacy Mode não significa ausência de processamento remoto. A organização precisa avaliar os termos,
provedores, retenção e acesso que se aplicam ao plano escolhido. Não existe validação de política
corporativa neste repositório.

Antes de um piloto, escolha dados sintéticos e um repositório de laboratório. Registre ferramenta,
modelo efetivamente retornado, duração, intervenção humana e resultado dos testes. Registre consumo
quando o provedor o informar, sem estimar tokens ou custo a partir do tempo de execução.

## Fontes oficiais

Consultadas em 21/10/2026:

- [Cursor CLI headless](https://cursor.com/docs/cli/headless)
- [Cursor CLI no GitHub Actions e autonomia restrita](https://cursor.com/docs/cli/github-actions)
- [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent)
- [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cursor: uso de dados](https://cursor.com/data-use)
- [Cursor: segurança](https://cursor.com/security)
- [Cursor Cloud: segredos e rede](https://cursor.com/docs/cloud-agent/security-network)
