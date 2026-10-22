# Segurança

O projeto é uma referência de desenvolvimento com dados sintéticos. A versão mantida é
a branch `main`. Uma cópia/template deve definir seu próprio responsável por segurança e
política de atualização; os controles de GitHub do repositório de origem não são copiados.

## Reportar uma vulnerabilidade

Use o canal privado de segurança do repositório quando disponível na aba **Security**.
Se ele não estiver habilitado, combine um canal privado com o mantenedor identificado no
[CODEOWNERS](.github/CODEOWNERS) antes de compartilhar detalhes. Não abra uma issue pública
com exploração, credenciais, dados pessoais ou informações de ambientes internos.
Não há prazo de resposta ou programa de recompensa estabelecido neste laboratório.

## Controles de referência

- Agentes recebem a credencial de inferência somente na etapa necessária; publicação e
  testes independentes têm responsabilidades próprias.
- Revisão e especificação não têm ferramentas; correção não executa comandos. Candidatas
  não fornecem código de controle a jobs com credenciais de publicação.
- Issues, comentários, diffs e recomendações de skills são dados de tarefa; não ampliam
  permissões, limites de tentativas ou autorização de merge.
- O bootstrap configura metadados e labels, preservando secrets, ativação de IA e proteção.
  O doctor verifica configuração por leitura e nunca consulta valores de secrets.
- CI, revisão e triagem se referem ao commit atual. Remover labels não apaga o histórico
  ou libera automaticamente um ciclo que já foi autorizado.

Consulte [governança](docs/governance.md), [arquitetura](docs/architecture.md) e
[operação GitHub](docs/runbooks/github-operations.md). Esses controles não substituem
IAM, isolamento, política de dados, faturamento ou validação exigidos por uma organização.
