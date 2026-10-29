# Documento interativo do produto

O guia combina arquitetura navegável, ambientes, operação, cenários de falha e evidências incrementais das seis fases. Os dados ficam separados da interface para atualizar cada fase somente após sua regressão.

```sh
node scripts/serve-product-docs.mjs
# Abrir http://127.0.0.1:4330/
node scripts/export-product-docs.mjs
# Exportação portátil: artifacts/product-guide.html
```

A exportação contém CSS e JavaScript locais, sem CDN, analytics, armazenamento de credenciais ou chamadas a modelos. Os links de evidência abrem os repositórios públicos. Não executa comandos: as receitas exibidas são instruções para o operador.

Os testes de protocolo controlado, pilotos Qwen reais e teste operacional com GitHub real devem ser lidos separadamente. As evidências e os limites de cada um constam no changelog. O laboratório não certifica escala, disponibilidade ou conformidade regulatória de produção.
