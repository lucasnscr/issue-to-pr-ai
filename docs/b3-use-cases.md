# Propostas de uso para discussão na B3

Estas são hipóteses de piloto de engenharia. Não representam uma iniciativa aprovada,
arquitetura interna ou recomendação para alterar sistemas de produção da B3.

A B3 mantém o portal público [B3 for Developers](https://developers.b3.com.br/) com documentação
de APIs para clientes B2B. Isso oferece um contexto público para discutir qualidade de integrações.
O catálogo deste repositório usa dados fictícios e não acessa APIs, credenciais ou dados da B3.

## Casos iniciais

| Caso proposto | Issue pequena | Evidência de aceite | Limite do piloto |
|---|---|---|---|
| Contratos de APIs | Acrescentar um filtro opcional ou corrigir validação de um parâmetro | OpenAPI, testes de compatibilidade, entradas inválidas e paginação | Serviço de laboratório com dados sintéticos |
| Regressão em integrações | Criar teste para um erro reproduzível de serialização, arredondamento ou layout | Fixture fictícia, reprodução da falha e teste que passa após a correção | Sem amostras de clientes ou dados de produção |
| Manutenção de dependências | Atualizar uma biblioteca em um serviço isolado | Build, testes, análise de dependências e diff revisado | Uma dependência por tarefa, sem promoção automática |
| Documentação e onboarding | Corrigir exemplo de SDK ou documentar um fluxo de erro | Exemplo executável e validação automática contra o contrato | Conteúdo autorizado, sem tokens ou endereços internos |

O domínio financeiro exige critérios claros sobre precisão e comportamento.
O agente pode preparar uma proposta. O responsável pelo domínio define os critérios e revisa as mudanças.

## Piloto proposto

Hipótese de desenho: uma equipe, duas semanas e cerca de dez issues pequenas em um repositório de laboratório.
O tamanho e a duração são sugestões, não resultados medidos.

Para cada issue, registre tempo de execução, tempo de revisão humana, intervenções, custo informado
pelo provedor e sucesso na primeira tentativa. Compare com tarefas equivalentes sem agente.
Use mediana e os resultados individuais, preservando tarefas que falharam.

O piloto depende de um responsável técnico, uma ferramenta/modelo autorizados, escopo de dados,
permissões mínimas e regras de branch aplicadas pelo GitHub. A expansão depende de evidências
de qualidade e esforço, além da avaliação interna das condições de uso dos provedores.

## Exemplo de issue

**Título:** filtro opcional por faixa de preço no catálogo de laboratório.

**Critérios:** preservar a listagem atual quando não houver filtros, aceitar limites inclusivos,
rejeitar valores negativos e intervalo invertido, combinar com categoria, manter paginação/totais
e atualizar OpenAPI. A validação usa PostgreSQL real, Docker e chamadas HTTP.

Esse exemplo aproxima a discussão de contratos, persistência e experiência do usuário sem reproduzir
uma regra financeira ou sugerir conexão com o ambiente de produção.

## Referências públicas

- [B3 for Developers](https://developers.b3.com.br/), consultado em 21/10/2026
- [B3: integrações da Área do Investidor](https://b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/integracoes-da-area-do-investidor-apis/), contexto público de APIs, não fonte dos dados do demo
- [Possibilidades de uso do Cursor](cursor.md)
