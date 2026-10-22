# 0003 — Selecionar instruções e aplicar configuração explicitamente

Status: vigente na implementação de referência.

## Contexto

Uma referência deve permitir práticas reutilizáveis e configuração reproduzível sem
carregar conteúdo arbitrário nem ativar chamadas pagas durante a cópia do projeto.

## Decisão

Skills têm IDs, fases, versões e hashes no catálogo confiável; a seleção acompanha a PR,
com manifesto por execução. Fontes originais são preservadas como referências, sem hooks
ou concessão de ferramentas. Graphify extrai AST da base, sem LLM.

O bootstrap tem prévia por padrão e exige `--apply`/destino explícito. Aplica metadados,
topics e labels, preservando secrets, ativação e proteção. O doctor somente lê e diferencia
configuração pronta de execução comprovada. Adaptação a outra stack continua sendo trabalho próprio.

## Consequências

Atualizações de skills precisam de revisão de conteúdo, integridade e avaliação de efeito.
Adoção exige responsáveis, políticas e testes no destino; não basta copiar os arquivos.
Não há atualização central de workflows ou quotas compartilhadas nesta versão.
Veja [skills](../skills-catalog.md) e [adoção](../runbooks/adoption.md).
