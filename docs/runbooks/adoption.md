# Adotar a referência e configurar o GitHub

## Origem e customização

Use **Use this template** quando a opção estiver habilitada no repositório de origem, ou
copie/forke um commit conhecido. Registre a origem e o SHA. Um template copia arquivos e
estrutura; secrets, permissões, labels, variáveis e proteção precisam ser configurados no
destino. Não foram criados outros repositórios automaticamente nesta entrega.

O método tem versão em `config/repository.json`. Essa versão identifica a configuração
do método; não substitui um commit imutável nem afirma que existe uma release/tag publicada.
Adaptação a outra stack continua exigindo validadores próprios; o perfil atual é Java/Spring/PostgreSQL.

Antes de usar em outro projeto:

1. Substitua responsáveis em CODEOWNERS e canais de segurança.
2. Adapte a aplicação e critérios de aceitação, preservando a separação de controle/geração.
3. Revise `AGENTS.md`, configurações de agentes, políticas, skills, guias e URLs de referência.
4. Confira a branch padrão. A referência usa `main`; não renomeie branches sem adaptar os workflows.
5. Execute a CI sem IA, configure os controles do destino e só então faça uma tarefa nova com modelo.

## Bootstrap: prévia e aplicação explícita

```sh
node scripts/bootstrap-repository.mjs --repo OWNER/REPOSITORY
```

A prévia é o padrão: não acessa nem altera o GitHub. A saída JSON identifica o destino,
descrição, homepage, opção de template, topics e labels desejados. Somente com destino
explícito e `--apply` o script realiza as mutações:

```sh
node scripts/bootstrap-repository.mjs --repo OWNER/REPOSITORY --apply
```

O script lê o estado antes de escrever, preserva topics/labels alheios ao catálogo e
atualiza labels gerenciadas por nome. Limites/informação incompleta bloqueiam a aplicação.
Operações são idempotentes; uma falha intermediária não é transação atômica e deve ser
inspecionada antes de repetir. O script não altera secrets, ativação de IA, proteção,
visibilidade, branch padrão ou CODEOWNERS. Criar a label não a adiciona a nenhuma issue/PR.

## Proteção e permissões

Confira o plano de proteção em [config/branch-protection.json](../../config/branch-protection.json).
O laboratório exige `Repository checks`, `Build and tests` e `AI review gate`, branch
atualizada, conversas resolvidas e proteção aplicada ao administrador. Não permita force
push ou exclusão. Uma organização deve ajustar aprovações e responsáveis à sua política.

A configuração não é aplicada pelo bootstrap para evitar substituir regras mais fortes
do destino. Um mantenedor administra a proteção pelo GitHub; o comando de reprodução da
referência está em [governança](../governance.md#proteção-aplicada-neste-repositório).
Em Actions / General, permita que os workflows criem PRs. Cada job continua declarando
suas permissões; esse ajuste não autoriza o modelo a aprovar ou integrar código.

## Doctor: inspeção somente leitura

```sh
node scripts/repository-doctor.mjs --offline
node scripts/repository-doctor.mjs --tools
node scripts/repository-doctor.mjs --github --repo OWNER/REPOSITORY --profile base
node scripts/repository-doctor.mjs --github --repo OWNER/REPOSITORY --profile specification
node scripts/repository-doctor.mjs --github --repo OWNER/REPOSITORY --profile all
```

| Perfil | O que inspeciona além das fontes |
|---|---|
| `base` | Metadados, template, labels, permissão de criar PR e proteção efetiva |
| `specification` | Base, ativação de especificação, modelo permitido e nome da credencial |
| `implementation` | Base, ativação da implementação OpenCode, modelo e nome da credencial |
| `claude` | Base, ativação Claude, modelo Anthropic e nome da credencial |
| `review` | Base, ativação de revisão, modelo e nome da credencial |
| `loop` | Base, ativações de revisão/correção, modelo e nome da credencial |
| `all` | Especificação, implementação OpenCode, revisão e loop; Claude é inspecionado separadamente |

Somente `--github` consulta a API, usando `gh` autenticado. O doctor usa rotas GET e o
endpoint de **nomes/metadados** de secrets; não lê os valores. Variáveis/modelos não são
impressos em erros. Informação negada/incompleta não comprova configuração correta.
Sem `--github`, solicitar um perfil de IA produz aviso, pois suas configurações remotas
não foram verificadas. Nenhuma destas verificações chama o provedor ou executa a aplicação.

| Saída | Significado |
|---|---|
| Exit `0`, `status: pass` | Itens inspecionados atendem ao perfil |
| Exit `2`, `status: warn` | Atenção/configuração incompleta ou metadados opcionais indisponíveis |
| Exit `1`, `status: fail` | Falha, controle obrigatório ausente ou argumento/configuração inválidos |

`executionVerified` permanece `false`: prontidão não é prova de teste real.
O perfil `all` exige flags ativas; sua falha em um clone com IA intencionalmente desligada
não significa falha da aplicação. Nesse caso, valide o perfil `base` e a CI sem IA.

## Ativação gradual

Configure apenas os perfis que deseja usar, seguindo [setup-cloud.md](../setup-cloud.md).
O bootstrap não os habilita. Comece com aplicação/CI, depois especificação ou implementação
e revisão; autorize `ai:autofix` somente quando os testes e o orçamento estiverem definidos.
Valide uma tarefa realmente nova, com dados sintéticos e relatório de resultados.
GPU/vLLM/ARC, quotas compartilhadas e controles corporativos exigem ambientes e validações próprios.

Fontes: [templates GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository),
[CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).
