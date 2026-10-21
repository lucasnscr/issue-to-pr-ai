# Triagem rastreável e check de liberação

`AI review gate` é um job nativo de `pull_request_target`, separado dos jobs de inferência
e correção. `AI review decision` mostra a decisão detalhada do reconciliador pela Checks API.
Depois de autorizar revisão, ele exige parecer confiável e CI aprovada do SHA atual,
decisão sobre cada achado e encerramento das correções. O mantenedor continua responsável
por avaliar o diff, marcar a PR pronta e decidir o merge.

## Registrar uma decisão

O parecer mostra um ID determinístico `f-...` para cada achado. Abra os detalhes do check
para copiar SHA, execução e comando. Um colaborador com permissão atual `write`, `maintain`
ou `admin` comenta **na PR**, usando o SHA completo e uma justificativa de 10 a 1000 caracteres:

```text
/ai-triage SHA_COMPLETO RUN_DA_REVISAO f-ID dismiss JUSTIFICATIVA_COM_EVIDENCIA
/ai-triage SHA_COMPLETO RUN_DA_REVISAO f-ID confirm JUSTIFICATIVA_COM_EVIDENCIA
/ai-triage SHA_COMPLETO RUN_DA_REVISAO f-ID investigate JUSTIFICATIVA_COM_EVIDENCIA
```

| Decisão | Efeito |
|---|---|
| `dismiss` | Achado não se aplica ao contrato atual; a justificativa deve demonstrar isso |
| `confirm` | Defeito confirmado; bloqueia a liberação até correção e nova revisão |
| `investigate` | Evidência insuficiente; mantém o bloqueio |

O último comando válido para o mesmo achado/revisão/SHA prevalece. O bot publica um recibo
com ator, justificativa, hash e ID do comentário original, commit, revisão e execução da
triagem. Não edite o comentário para mudar a decisão: publique outro. Editar ou apagar a
origem invalida o recibo na reconciliação; esses eventos também solicitam reavaliação.
Comentários de bots, pessoas sem escrita, comandos em issues e referências obsoletas não
autorizam decisões. O gate reconsulta permissões; após alterar acesso de colaboradores,
solicite reconciliação antes de integrar uma entrega.

## Reconhecer uma parada

Uma correção ainda em execução impede liberação. Depois de terminar, uma parada em
`needs-human` ou uma reserva interrompida em `active` exige inspeção e reconhecimento
explícito. O check mostra o identificador do estado atual:

```text
/ai-triage SHA_COMPLETO RUN_DA_REVISAO cycle-ID acknowledge JUSTIFICATIVA_COM_EVIDENCIA
```

Esse comando precisa ser posterior à conclusão das execuções e ao estado registrado.
Ele não dispensa a triagem dos achados nem altera o estado original, tentativas ou reservas.
Se o estado mudar, seu identificador muda e exige nova decisão. Remover `ai:autofix` não
recupera tentativas. Para interromper correções, remova a label e cancele execuções já iniciadas.

## Interpretar a decisão e o check obrigatório

| Conclusão de `AI review decision` | Significado |
|---|---|
| `success` | Parecer, CI e decisões válidos para este SHA; ou caminho manual explícito de uma PR nunca autorizada para IA |
| `action_required` | Revisão/CI aguardada, achado pendente/confirmado, correção ativa ou parada sem reconhecimento |
| `failure` | CI reprovada ou erro ao verificar dados/procedência; não libera a entrega |

Um novo SHA exige nova revisão e decisões. Remover labels preserva o registro persistente
da autorização. O check não muda o draft nem publica aprovação ou merge. O sucesso do job
que registra `needs-human`, ou do reconciliador que publica um bloqueio, não torna o check
de liberação bem-sucedido. O job nativo `AI review gate` só fica verde após verificar
novamente os dados atuais em modo somente leitura; pendências e erros resultam em job
reprovado. Ele não transforma o sucesso técnico do reconciliador em autorização de entrega.

O caminho manual existe para dependências, infraestrutura e outras entregas conduzidas pelo
mantenedor sem autorização de revisão por IA. CI e regras de revisão da branch continuam
obrigatórias. Quando a IA foi autorizada e o patch excede seus limites, este gate exige
investigação e adequação do escopo; não há um comando genérico de bypass.

## Arquitetura e operação

`ai-review-gate-events.yml` encaminha eventos de PR, conclusão de CI/revisão/correção e
comentários de triagem para `ai-review-gate.yml`. `ai-review-gate-check.yml` publica o job
nativo obrigatório. Os três usam exclusivamente código da
branch padrão, metadados e APIs. Não executam o head da PR, não baixam seus artefatos e
não recebem secret do modelo. Todas as revisões automáticas são encaminhadas para dispatch
na branch padrão; o gate verifica workflow, repositório, branch, tentativa e conclusão.

A autorização persiste um marcador antes da inferência e invalida a decisão anterior.
Uma nova decisão também cria uma nova geração de check; uma avaliação antiga não pode
publicar sucesso sobre essa geração. O job obrigatório reconsulta revisão, CI, permissões,
recibos, peers do mesmo SHA e geração da decisão, sem criar recibos. Um novo comando válido
que ainda aguarda recibo impede que ele reutilize um descarte anterior.
O worker serializado reconcilia todas as PRs abertas
e seus comentários, pois o GitHub pode substituir execuções pendentes do mesmo grupo.
PRs no mesmo SHA compartilham o resultado mais restritivo, já que checks pertencem a commits.
Quando a conclusão esperada muda, o worker solicita reexecução do workflow nativo elegível
do mesmo SHA/PR. Execuções em andamento são acompanhadas por seu evento de conclusão; não
se cria uma nova execução quando a conclusão já corresponde à decisão, evitando um ciclo
de reexecuções. Isso não inicia chamadas ao modelo. Na primeira implantação, uma PR já
aberta precisa de evento elegível (novo commit, saída de draft ou alteração de label).
O perfil limita a reconciliação a 100 PRs abertas e 1000 comentários por PR; excesso ou
erro de consulta bloqueia e requer investigação. Mudanças em permissões ou reparos de
configuração podem exigir uma execução manual:

```sh
gh workflow run ai-review-gate.yml --ref main -f pull_request=NUMERO
```

## Exigir na proteção da branch

O perfil em `config/branch-protection.json` inclui o **job nativo** `AI review gate`, além
dos dois checks de CI. Não exija `AI review decision`. No repositório de destino, publique
os workflows, dispare um evento elegível em uma PR, execute o reconciliador e confirme que
o job nativo passou. Então adicione-o às verificações obrigatórias, associado ao GitHub Actions.
Preserve as demais regras existentes. Copiar o JSON não aplica a proteção no GitHub.
Referências: [Checks API](https://docs.github.com/en/rest/checks/runs) e
[proteção de branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
O GitHub restringe quais eventos de jobs atendem verificações obrigatórias; um check verde
criado pela API não comprova aceitação da política de merge. Valide também uma integração
real sob a regra, conforme [diagnóstico de checks obrigatórios](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

Os testes Node cobrem permissão, recibos falsificados/obsoletos, novo SHA, CI, procedência,
paradas, execução ativa, concorrência entre gerações e PRs no mesmo commit. O laboratório
real e as limitações observadas estão em [validação de R1/R2](validacao-review-quality-triage.md).
