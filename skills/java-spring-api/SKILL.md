---
name: java-spring-api
description: Implementar contratos HTTP e mudanças no catálogo Java Spring preservando seus comportamentos existentes.
---

# Contrato da API

Para o comportamento alterado, siga o caminho Controller → Service → Repository e as conversões do DTO/entidade. Não reimplemente normalização que já acontece nesse caminho.

Diferencie parâmetro ausente, vazio e inválido. Preserve respostas ProblemDetail, status de conflito de SKU e paginação/ordenação existentes. Para filtros combinados, verifique limites inclusivos e o desempate determinístico por ID.

Uma listagem de valores distintos, como categorias, não deve herdar silenciosamente a paginação dos produtos. Confirme o contrato do endpoint antes de escolher Page, List ou projeção.

Documente parâmetros e resultados alterados no OpenAPI, com exemplos que correspondam ao HTTP realmente implementado.
