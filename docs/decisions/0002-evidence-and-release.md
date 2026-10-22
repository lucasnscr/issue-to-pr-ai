# 0002 — Decidir entrega com evidência do commit atual

Status: vigente na implementação de referência.

## Contexto

Um workflow pode concluir tecnicamente depois de registrar `needs-human`. Modelos podem
produzir falsos positivos; checks antigos podem não descrever o código atual.

## Decisão

Relacionar critérios, testes, revisão, triagem, consumo e tentativas ao SHA. Manter CI e
`AI review gate` obrigatórios, com proteção aplicada ao administrador. O ciclo tem até duas
correções e reserva estimada definida; falhas não apagam tentativas. O mantenedor decide o
merge, inclusive quando delega sua execução expressamente.

## Consequências

Checks, triagem e estado do ciclo são sinais diferentes. Resultados ausentes não equivalem
a zero/sucesso. A avaliação da qualidade usa dataset e proveniência, não a existência de um
parecer. Uma rodada real comprova aquele cenário, sem garantia universal de qualidade ou custo.
Veja [triagem](../review-triage.md) e [validação](../runbooks/validation.md).
