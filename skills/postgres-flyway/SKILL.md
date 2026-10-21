---
name: postgres-flyway
description: Avaliar consultas e mudanças de persistência PostgreSQL no catálogo, incluindo dados fora da normalização da entidade.
---

# Persistência observável

Quando o contrato admite dados gravados por SQL/migrations, teste a consulta com essas entradas; não conclua que a normalização da entidade garante todo conteúdo do banco. Não exija suportar caminhos que o contrato explicitamente proíbe.

Em DISTINCT, confira a expressão projetada, a ordenação e a normalização efetivas. Se SELECT e ORDER BY usam a mesma expressão, não invente uma incompatibilidade baseada em um futuro provedor JPA.

Para mudanças de esquema, preserve migrations existentes e proponha uma nova. Verifique constraints de preço/SKU e rollback após uma requisição inválida. Preços usam BigDecimal e tipo decimal, com os limites do contrato, sem conversão intermediária para double.

Uma hipótese sobre outro banco ou contrato futuro não demonstra um defeito no PostgreSQL atual.
