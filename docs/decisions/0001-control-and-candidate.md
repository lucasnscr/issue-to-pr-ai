# 0001 — Separar controle confiável e código candidato

Status: vigente na implementação de referência.

## Contexto

Uma issue e um patch podem conter instruções ou código gerado. A geração precisa editar
o produto, mas não deve escolher permissões, validadores ou condições de publicação.

## Decisão

Workflows e scripts de controle partem da branch confiável. A inferência não recebe token
GitHub de publicação. O revisor e o especificador não têm ferramentas. O corretor recebe
um diretório isolado sem comandos; outros jobs validam e publicam na mesma PR.
Um runner novo reaplica e verifica o patch antes de escrever no GitHub.

## Consequências

Há etapas e artefatos adicionais, mas a candidata não escolhe os próprios controles.
Autorizações, SHA/base e escopo precisam ser reconsultados. Esse desenho não é uma garantia
de isolamento de sistema operacional: runners, rede e identidade ainda exigem política de ambiente.
Veja a [arquitetura](../architecture.md) e os [limites de execução](../governance.md).
