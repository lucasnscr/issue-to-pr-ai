# Entrega local de uma issue autorizada

O controlador fica fora do modelo. Ele consulta o GitHub pela CLI autenticada, verifica colaborador com escrita, issue aberta com ai:ready e critérios limitados a 20.000 caracteres. Revalida conteúdo, autorização e base antes de publicar. O modelo recebe apenas a tarefa e o checkout público, sem token GitHub.

O executor aceita uma VM Lima dedicada com prefixo sentinela-ai-, em execução, sem mounts compartilhados e sem SSH agent encaminhado. O home do host não é montado. O controlador usa somente código de engine já commitado e exportado por git archive; alterações locais no executor impedem execução.

Preparação do laboratório:

```sh
limactl start --name sentinela-ai-pilot --vm-type vz --mount-none --cpus 4 --memory 8 --disk 30 --tty=false template:docker-rootful
```

Instale Java 21 e Node 24 na VM usando fontes oficiais e checksum do Node. Construa infra/agents/Dockerfile no daemon Docker dessa VM. O laboratório inicial usou Lima 2.2.1, Ubuntu 26.04 arm64, Node 24.21.0, Java 21 e Docker 29.9.2; não são versões mínimas certificadas para qualquer máquina.

```sh
node scripts/local-issue.mjs --repo=lucasnscr/issue-to-pr-ai --issue=NUMERO
```

A issue não escolhe comandos nem o perfil. O mapa de destinos é código confiável, inicialmente catalog-java. Um lock por VM impede sobreposição; ocupação falha explicitamente. O proxy de laboratório escuta somente no loopback da VM, permite endpoints específicos e somente o modelo qwen3-coder:30b. Ele alcança o Ollama do Mac via host.lima.internal. Não é um gateway de produção.

O OpenCode executa em container não privilegiado, filesystem base somente leitura, sem capabilities, sem socket Docker e com ferramentas de leitura/edição. Comandos ficam desabilitados; a validação executável acontece depois, na VM dedicada. O publisher no host aplica e verifica o patch, mas não executa código candidato.

O perfil Java exige alterações da aplicação e de teste IT. Depois do escopo, o controlador executa Maven/PostgreSQL e os quatro critérios HTTP independentes existentes, com Compose. O perfil independente catalog-categories-no-store acrescenta um critério específico do piloto; a issue não pode inventar comandos de aceite.

Ao fim, o controlador remove container, recursos Compose, proxy e workspace do job. A VM e caches de ferramentas permanecem no laboratório até serem removidos explicitamente. Uma interrupção abrupta do processo/host pode exigir limpeza pelo operador; isso não equivale a um runner GitHub descartável certificado. A automação da fase seguinte precisa confirmar o descarte de toda a VM/executor e não montar esse laboratório pessoal como runner persistente.

Relatórios agregados ficam em artifacts/local-issue-N.json. Falhas registram estágio e preservam apenas diagnósticos locais de validação/uso. Nenhuma falha libera PR ou deploy. Uma PR draft exige revisão separada; o controlador não aprova nem faz merge.
