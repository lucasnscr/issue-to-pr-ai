# Apresentação do laboratório de desenvolvimento com IA

Apresentação de 12 slides em português, com roteiro para aproximadamente 15 minutos.
O conteúdo apresenta uma prova de conceito pessoal e propostas de piloto para equipes de engenharia.

O PowerPoint mantém textos e tabelas editáveis. As notas dos slides contêm o roteiro e links das fontes.
O PDF serve como cópia para projeção, com aparência preservada. O roteiro em Markdown ajuda no ensaio.

- [PowerPoint editável](apresentacao.pptx)
- [PDF para projeção](apresentacao.pdf)
- [Roteiro com notas e fontes](roteiro.md)

O deck mostra casos de uso em engenharia, a alternativa Cursor e os resultados reais de `/oc`,
`@claude`, revisão consultiva e Kubernetes. A revisão por IA levantou hipóteses que exigiram
checagem do código/testes, e essa limitação aparece no desenho do piloto.

## Atualização das evidências

`evidence.json` distingue o teste histórico de categoria das novas execuções. Atualize o estado e os links
apenas após conferir os resultados. Uma execução pendente não pode aparecer como sucesso na apresentação.
Os números históricos pertencem a commits e execuções específicos, sem promessa de resultados futuros.

## Regeneração

`build.mjs` usa o runtime `@oai/artifact-tool` fornecido pelo ambiente de autoria. Não instala dependências.
Informe os caminhos do runtime em `RUNTIME_NODE_MODULES`, `RUNTIME_PYTHON` e `PRESENTATIONS_SKILL_DIR`.
A cópia PDF usa os renders revisados se a exportação PDF nativa estiver indisponível.

Escolha uma pasta privada em `PRESENTATION_BUILD_DIR` e uma revisão nova em `PRESENTATION_REVISION`.
Execute com o Node do runtime. O script exporta e valida o PPTX, renderiza cada slide e gera PDF/roteiro.
Revise visualmente os slides antes de copiar os arquivos finais para esta pasta.

```sh
node docs/presentation/build.mjs
```

Arquivos temporários, previews e relatórios de validação permanecem fora do Git.
