# Roadmap para um modelo reutilizável de trabalho

R1 possui avaliador, dataset e workflow implementados; veja o [guia de avaliação](reviewer-evaluation.md).
As demais linhas abaixo são propostas. A prioridade parte
do [laboratório real](validacao-engineering-loop.md): duas correções funcionaram, mas
pareceres especulativos consumiram o ciclo e exigiram triagem. A próxima etapa recomendada
é tornar a decisão de entrega mais confiável e a adoção mais reproduzível.

## Ponto de partida

| Já implementado | Próximo problema a resolver |
|---|---|
| Issue autorizada → código/testes → draft PR | Adaptação ainda específica ao catálogo Java |
| Revisão estruturada e avaliação versionada | Reduzir falsos positivos e hipóteses sobre mudanças futuras com evidências |
| Duas correções com reserva persistida e push isolado | Triagem manual e ausência de check próprio de liberação do ciclo |
| Telemetria e artefatos por execução | Ausência de consolidação durável por tarefa/equipe |
| Limites observados por execução/PR | Ausência de quota financeira global integrada ao provedor |
| Docker/PostgreSQL e Kubernetes local validados | Ausência de preview automático por PR; vLLM/ARC sem implantação validada |

## Ordem proposta

| ID | Prioridade | Feature | Critério mínimo de aceite | Depende de |
|---|---|---|---|---|
| R1 | Implementado | Avaliação reproduzível da qualidade do revisor | Dataset de seis casos, métricas, proveniência, modo offline e workflow real limitado; resultados reais devem ser conferidos por execução | [Guia e limites](reviewer-evaluation.md) |
| R2 | P0 | Triagem rastreável e check de liberação do ciclo | Classificar achados por pessoa autorizada; check do SHA atual permanece pendente/bloqueado enquanto houver decisão necessária; novo SHA invalida decisões antigas | Identidade dos achados e política de triagem; R1 orienta os casos de teste |
| R3 | P1 | Template e bootstrap verificável | Novo repositório executa CI sem IA, detecta configuração ausente e completa uma tarefa de exemplo realmente nova, seguindo instruções reproduzíveis | Modelo de trabalho e perfil atual |
| R4 | P1 | Workflows reutilizáveis e adaptadores por stack | Dois repositórios consomem a mesma versão de orquestração; um segundo perfil troca build/testes/caminhos sem alterar controles de publicação | R3 e contrato de entradas/saídas |
| R5 | P1 | Histórico operacional e painel do ciclo | Consultar issue, PR, SHAs, tentativas, estado, triagem e consumo agregado; distinguir custo estimado, faturado e indisponível | Schema de eventos e retenção; R2 para decisões de triagem |
| R6 | P1 | Quotas compartilhadas e conciliação financeira | Reservas concorrentes de várias PRs respeitam quota da equipe; uma política bloqueia chamadas antes de exceder a quota disponível; faturamento conciliado separadamente | Armazenamento transacional, R5 e integração com provedor/gateway |
| R7 | P2 | Perfil de verificações de segurança | Achado demonstrável de código/dependência/segredo bloqueia a entrega conforme política; artefatos e permissões mínimas definidos | Política da equipe e checks de liberação |
| R8 | P2 | Preview efêmero e runners isolados | Ambiente por PR com banco sintético, aceitação HTTP e limpeza após fechamento/falha; evidência de isolamento do ambiente escolhido | R4, identidade de implantação e infraestrutura de laboratório |

P0 significa a próxima prioridade sugerida para este projeto; não é a severidade P0 de um
achado de código. Cada linha deve virar uma tarefa pequena com critérios próprios somente
quando a equipe decidir executá-la. A tabela não estima prazos nem cria issues automaticamente.

## R1 e R2: confiabilidade antes de ampliar a autonomia

O conjunto de avaliação deve incluir os casos observados: normalização feita fora do diff,
limite de 20 produtos, categorias inseridas por SQL e sugestões baseadas em trocar JPA ou
tornar um campo obrigatório no futuro. Para cada caso, preservar patch, contexto, versão da
política, resultado esperado e justificativa do responsável. Um teste com resposta simulada
valida o parser; a avaliação do modelo precisa registrar a execução real e sua variabilidade.

A triagem proposta identifica achado, SHA, decisão, evidência e ator. Descartar um achado
como falso positivo exige justificativa; confirmar um defeito exige correção ou decisão explícita do
responsável. O check de liberação deve refletir essa política mesmo quando o workflow que
registrou `needs-human` terminou tecnicamente com sucesso. Um erro ao consultar o estado
não pode liberar a entrega por padrão. Limites e histórico de tentativas continuam preservados.

Checks obrigatórios precisam ser aplicados pelo mantenedor nas regras da branch; documentar
o processo não o aplica. Veja [proteção de branches no GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## R3 e R4: distribuição e adaptação

O bootstrap proposto deve verificar ferramentas, permissões, nomes da branch padrão,
proteção, perfis de validação e presença de configuração, sem mostrar valores de secrets.
A prévia não altera o GitHub; mudanças exigem uma ação explícita do mantenedor.
Os exemplos devem distinguir funcionalidades já existentes de novas tarefas, evitando
reabrir o exercício de categorias como se estivesse pendente.

Marcar um repositório como template permite gerar projetos a partir dos arquivos e da
estrutura; essa opção ainda não foi ativada aqui. Referência: [template repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository).
Essa distribuição deve ter versão e guia de atualização para os consumidores.

Workflows centrais propostos usariam `workflow_call`, com entradas, secrets e permissões
explícitos, consumidos por revisão imutável. Um adaptador descreveria caminhos, build,
testes, aceitação e empacotamento. A troca de stack não deve permitir ao agente trocar os
validadores nem executar código candidato com credenciais de publicação.
Referência: [reutilização de workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
Os workflows atuais ainda não expõem esse contrato genérico.

## R5 e R6: operação e consumo por equipe

Começar por eventos versionados e uma consulta simples antes de construir o painel.
Registrar transições com repositório, issue/PR, SHA, execução, tentativa, política e ator,
preservando idempotência e as tentativas falhas. Prompts, credenciais e saída bruta do
modelo não são necessários para esse histórico. O painel seria uma função operacional
nova, distinta da interface atual de cadastro de produtos.

A quota agregada precisa resolver concorrência entre PRs e reconciliação de chamadas com
resultado desconhecido. Alertas e estimativas por execução não garantem teto de fatura.
Um limite financeiro efetivo depende também dos mecanismos do provedor/gateway e de testes
de indisponibilidade, atraso de consumo e chamadas já aceitas.

## R7 e R8: ampliar os controles com evidência

O perfil de segurança proposto cobre análise estática, dependências, busca de segredos e
proveniência da imagem/artefato. Critérios de bloqueio e de triagem devem ser definidos pela
equipe; adicionar uma ferramenta sem política de resultado não conclui a feature.

O preview pode começar com infraestrutura CPU e PostgreSQL. Cada PR precisa de namespace
ou ambiente equivalente, dados sintéticos, identificação do commit e limpeza verificável,
inclusive em falhas. GPU/vLLM e ARC devem ter validação própria se forem escolhidos; os
manifestos atuais e a execução do catálogo em kind não comprovam esses componentes.

## Proposta de primeiro incremento

Começar por **R1**, usando os achados reais já registrados como casos de avaliação, e por
uma entrega pequena de **R2**, que torne visível a necessidade de triagem no SHA atual.
Depois, validar **R3** em um segundo repositório antes de generalizar a orquestração em **R4**.
R5/R6 podem evoluir quando houver eventos e volume suficientes para justificar a operação
compartilhada. A expansão depende de evidências de qualidade, esforço de revisão e consumo.
