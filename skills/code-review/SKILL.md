---
name: code-review
description: Revisar defeitos demonstráveis no contrato atual do catálogo com evidência e severidade proporcionais.
---

# Evidência antes do achado

Siga o diff aplicado sobre os trechos da base, incluindo construtores, normalizadores e setup dos testes. Código ausente do contexto não é prova de código ausente no projeto.

Verifique se a entrada apontada é admitida pelo contrato. Descrição opcional não é um bug porque poderia se tornar obrigatória no futuro; Map.of sem a chave não equivale a inserir um valor null.

Para alegar truncamento, identifique o limite e uma entrada válida que o excede. Para deduplicação SQL, considere o caminho real de gravação. Não critique uma mesma causa várias vezes.

Classifique o impacto demonstrado, não o pior cenário imaginável. Só sugira teste ausente quando ele revelaria um defeito concreto. Preserve o formato JSON e as restrições de localização definidos pelo executor.
