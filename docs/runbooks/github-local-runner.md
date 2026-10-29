# Implementação GitHub com inferência local

O comentário /oc em issue aberta com ai:ready inicia autorização na branch padrão. Colaborador precisa ter escrita. O engine é um SHA imutável contido no histórico revisado da main; a issue não escolhe comandos, repositório ou engine.

Etapas separadas:

1. Autorizar issue, ator, perfil e base.
2. Gerar patch com OpenCode/Qwen em VM descartável sem home montado. Token de publicação não entra no container do modelo.
3. Congelar patch, uso e identidade em artefato antes de executar código candidato.
4. Validar em runner hospedado, com permissões de leitura, sem acesso ao Ollama ou ao token de publicação.
5. Publicar somente o mesmo patch, após revalidar autorização e base. A PR permanece draft.

O issue-to-pr-ai usa publisher GitHub separado. O Sentinela mantém a restrição que impede Actions de criar/aprovar PRs: o provider local publica com a sessão gh já autenticada, após conferir os jobs e o workflow reutilizável. Essa credencial permanece no host, com os escopos existentes da sessão; a whitelist limita o uso pelo programa, não reduz os escopos do token. Um job de leitura exige recibo da PR correspondente e falha se a publicação local não ocorrer.

Preparação: use a VM base sentinela-ai-pilot com mounts vazios, Node 24, Docker e imagem OpenCode do runbook local. O provider clona a base parada e cria uma VM por job. config/local-runner.json fixa versão, origem oficial e SHA-256 do runner; bytes são conferidos antes de executar. O gateway escuta no loopback da VM, exige chave efêmera e aceita apenas endpoints/modelo aprovados.

```sh
node scripts/run-ephemeral-runner.mjs --watch --max-jobs=100
```

O provider precisa permanecer ativo no Mac com Ollama disponível. Cada registro GitHub recebe --ephemeral e label exclusiva do run. Depois da geração, a VM e o registro são removidos; a validação continua hospedada. O relatório local artifacts/ephemeral-runners.jsonl registra criação e descarte sem credenciais. A base parada conserva somente ferramentas/caches do laboratório.

Ativação por repositório, somente após os testes:

```sh
gh variable set AI_ENABLED --repo OWNER/REPO --body true
gh variable set LOCAL_AI_ENABLED --repo OWNER/REPO --body true
```

Com LOCAL_AI_ENABLED=true, o caminho legado /oc não executa outro modelo em paralelo. @claude continua sendo seleção explícita separada, se habilitada. Não há fallback silencioso. Desative AI_ENABLED para suspender toda implementação; não troque apenas LOCAL_AI_ENABLED para false esperando manter seleção local, pois isso devolve /oc ao caminho legado configurado.

Operação: /oc precisa de uma issue autorizada e o provider online. Uma nova tentativa não substitui uma PR aberta com patch diferente. Revisão, merge e deploy continuam separados. A CI é iniciada explicitamente para PRs criadas pelo token de Actions. Falhas/cancelamentos conservam callbacks SDLC e o worker continua verificando saúde independentemente do código gerado.

O provider é de laboratório/homologação, com uma VM/modelo por vez e limite explícito de jobs. Ele não configura serviço no boot. Falha abrupta do host pode exigir limpeza; registre o nome da VM e o run antes de recuperar. Para uma implantação de produção, substitua a sessão gh por identidade de serviço e aplique políticas de rede/infraestrutura adequadas ao ambiente.
