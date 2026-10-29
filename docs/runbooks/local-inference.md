# Inferência local para implementação

O provedor de implementação é independente do diagnóstico do Sentinela. Ollama usa a API compatível no OpenCode e a API nativa no diagnóstico.

Configuração do executor isolado:

```sh
MODEL=ollama/qwen3-coder:30b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

OLLAMA_BASE_URL recebe a raiz, sem /v1. O wrapper acrescenta /v1 ao configurar o OpenCode. Loopback HTTP não exige chave; um gateway HTTPS remoto exige OLLAMA_API_KEY. URLs com credenciais, query, fragmento ou caminho são rejeitadas. A configuração guarda referência à variável, nunca o valor da chave.

O perfil implementation permite explicitamente esse modelo. Outros modelos exigem edição revisada da allowlist. A resolução do provedor não reaproveita credenciais de Claude/vLLM e não faz fallback. Especificação, revisão e correção mantêm suas listas atuais até serem avaliadas separadamente.

```sh
node scripts/ollama-preflight.mjs
node scripts/opencode-preflight.mjs
```

O primeiro comando valida protocolo nativo, ferramentas, contexto efetivo e tokens. O segundo usa OpenCode 1.19.3 em container descartável não privilegiado, com fixture sintética e política de implementação. Exige Docker Desktop com acesso ao Ollama do host pelo bridge interno. Não executa uma issue de aplicação.

Custos iguais a zero no catálogo do OpenCode são estimativas desse catálogo; energia, hardware e tempo continuam existindo. Tokens ausentes não são zero e bloqueiam a publicação. Os relatórios em artifacts são locais e não devem ser versionados.

Não execute patches candidatos no ambiente pessoal. O executor das próximas fases utiliza VM dedicada sem montagem do home; a publicação é externa ao processo do modelo. A configuração de projeto não transforma, sozinha, um processo no host em sandbox.
