# Quickstart

## 1. Entender a referência

Leia o [modelo de trabalho](modelo-de-trabalho.md): uma issue define o contrato; skills
orientam o agente; validações independentes produzem evidências; revisão e triagem sustentam
a decisão do mantenedor. Não é necessário habilitar IA para testar a aplicação ou a CI.

## 2. Preparar e verificar o checkout

Requisitos para validação completa: Git, Node.js 22+, Java 21, Python 3.10+, Docker/Compose
ativo e kubectl para renderizar os manifests. A CLI `gh` é necessária apenas para os
diagnósticos e operações GitHub. O Maven Wrapper fornece a versão de Maven do projeto.

```sh
make setup
make doctor
node scripts/repository-doctor.mjs --tools
make verify
```

`make doctor` lê configuração local. `--tools` verifica versões e disponibilidade de
ferramentas, sem executar os testes ou chamar um modelo. `make verify` reúne checks dos
scripts/documentação/configuração e testes Java/PostgreSQL. Veja [validação](runbooks/validation.md).

## 3. Usar a aplicação de laboratório

```sh
docker compose up --build -d
make acceptance
```

Acesse a [interface](http://localhost:8080/), o
[Swagger](http://localhost:8080/swagger-ui/index.html) ou o
[OpenAPI JSON](http://localhost:8080/v3/api-docs). A aceitação usa dados sintéticos e remove
os registros criados por seus scripts; não aponte o comando para um ambiente produtivo.
O volume local persiste dados; `docker compose down` encerra os containers.
Contrato e exemplos estão em [apps/catalog-api/README.md](../apps/catalog-api/README.md).

## 4. Preparar o GitHub

Inspecione o plano antes de aplicar metadados, topics e labels:

```sh
node scripts/bootstrap-repository.mjs --repo OWNER/REPOSITORY
node scripts/bootstrap-repository.mjs --repo OWNER/REPOSITORY --apply
node scripts/repository-doctor.mjs --github --repo OWNER/REPOSITORY --profile base
```

O bootstrap não configura secrets, não habilita modelos e não reduz proteção. Complete
os passos de [adoção](runbooks/adoption.md), incluindo responsáveis, proteção, permissões e
variáveis. Provisionamento de secrets usa a interface GitHub, sem enviar valores ao chat.

## 5. Operar uma tarefa com IA

Crie uma issue nova com critérios e escopo. Escolha skills no formulário. Com as variáveis
apropriadas ativas, `/ai-spec` pode levantar decisões; depois de incorporá-las, um
colaborador adiciona `ai:ready` e comenta `/oc implemente esta issue` ou `@claude implemente esta issue`.
O caminho automático atual exige produção Java e integração `*IT.java`; manutenção do
método segue PR do mantenedor. Não reabra exemplos históricos já atendidos.

Confira draft PR, SHA, CI, consumo, skills e parecer. Autorizar correção é opcional e
separado. O [runbook GitHub](runbooks/github-operations.md) relaciona comandos e retomadas.
