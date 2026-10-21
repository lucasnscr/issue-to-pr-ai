---
name: grill-me
description: Esclarecer decisões pendentes de uma issue antes da implementação, em rodadas explícitas de perguntas.
license: MIT
metadata:
  upstream: "https://github.com/mattpocock/skills"
  revision: "5beb35b040e3de97e54fa9e386d7e42d15c295c2"
  adaptation: "issue-to-pr-ai-v1"
---

# Grill-me para issues

Adaptação de grill-me + sua dependência grilling, de Matt Pocock. Os originais e a licença estão em skills/upstream/mattpocock/.

Mapeie as decisões da especificação como uma árvore. Pergunte apenas sobre a fronteira atual: decisões cujos pré-requisitos já estão resolvidos. Em uma rodada, agrupe até cinco perguntas independentes, com ID, recomendação e consequência. Aguarde respostas antes de perguntas que dependam delas.

Use os fatos já presentes na issue e no contexto da base. Pergunte sobre decisões do responsável, sem pedir que ele investigue fatos que já foram fornecidos. Nunca invente respostas nem trate silêncio como concordância.

Este adaptador assíncrono produz somente perguntas e uma proposta de critérios. Não edita a descrição, não adiciona ai:ready e não inicia código. Uma nova rodada depende de um novo /ai-spec do colaborador. Se os critérios já estão completos, indique draft-ready sem criar perguntas artificiais.

Diferenças do upstream: a rodada é limitada para Actions; a exploração é preparada pelo pipeline, sem subagentes; não há invocação recursiva da ferramenta Skill.
