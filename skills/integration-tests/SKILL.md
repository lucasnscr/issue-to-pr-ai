---
name: integration-tests
description: Escrever regressões HTTP e PostgreSQL que distinguem a implementação correta da versão defeituosa.
---

# Regressão verificável

Escolha entradas que exponham a causa: por exemplo, 21 categorias para um corte de 20; variantes por JDBC para um defeito de normalização da consulta. Use a API para dados normais e JDBC apenas quando o caso depende de contornar a entidade.

Em TestRestTemplate, passe valores crus como variáveis de URI; uma URL pré-codificada pode sofrer dupla codificação e testar outra entrada.

Confira status, corpo e efeito no banco. Para entrada inválida, verifique também que nenhum produto foi criado/alterado. Cubra vazio, limite e combinação relevante, sem espelhar cada linha da implementação.

Escreva o teste que falharia antes da correção. Só afirme ter observado a falha anterior se essa versão foi realmente executada; caso contrário, marque a evidência como não executada. O corretor escreve os testes; jobs independentes executam os comandos.
