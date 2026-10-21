# PluginsX

PluginsX é um projeto para servidores Minecraft **PaperMC**. O repositório reúne o site, a API de catálogo e licenças, o plugin SpawnerX e os artefatos publicados para download.

> **Compatibilidade:** os plugins e downloads deste projeto são destinados exclusivamente ao PaperMC. Spigot, Bukkit sem Paper e outras plataformas não são suportados.

## O que faz parte do projeto

- **Website:** catálogo para consultar versões e baixar plugins, além da interface para gerar uma chave de acesso.
- **API:** fornece o catálogo PaperMC, filtra releases, entrega os arquivos JAR e gerencia a licença padrão do PluginsX.
- **SpawnerX:** plugin PaperMC para administrar spawners, com loja, melhorias, raridades e vendas públicas por XP.
- **Catálogo de releases:** índices JSON e JARs publicados em `builds/`, consumidos pela API.

## Estrutura do repositório

```text
.
├── api/                      # API Elysia, TypeScript e MongoDB
├── builds/                   # JARs publicados e índices de releases
├── plugins/
│   ├── SpawnerX/             # Projeto Gradle do plugin SpawnerX
│   └── gradle/               # Tarefas compartilhadas para o catálogo
├── website/                  # Aplicação Next.js
├── LICENSE
└── README.md
```

## Requisitos

- [Bun](https://bun.sh/) para instalar dependências e executar a API e o site.
- Java 25 recomendado para validar e compilar a matriz atual do SpawnerX. O Gradle usa toolchains para os alvos e pode baixar o JDK necessário.
- Uma instância MongoDB Atlas para executar a API. `MONGODB_URI` precisa usar o formato `mongodb+srv://`.
- Credenciais de uma aplicação Discord para as variáveis obrigatórias de configuração da API.

## Executar localmente

A API e o site são aplicações independentes. Abra dois terminais na raiz do repositório.

### 1. Configurar e iniciar a API

Instale as dependências:

```bash
cd api
bun install
```

Crie `api/.env.development.local` com os valores abaixo:

```dotenv
BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef
BETTER_AUTH_URL=http://localhost:3333
BETTER_AUTH_DOMAIN=localhost
DEFAULT_PORT=3333
DISCORD_CLIENT_ID=seu-client-id
DISCORD_CLIENT_SECRET=seu-client-secret
URL=http://localhost:3333
DEV_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://usuario:senha@cluster.exemplo.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=pluginsx
```

`BETTER_AUTH_SECRET` deve ter exatamente 32 caracteres. `BETTER_AUTH_DOMAIN` é opcional; `DEFAULT_PORT` assume `3333` quando omitida. A API conecta ao MongoDB antes de começar a escutar a porta.

Inicie o servidor:

```bash
bun run dev
```

### 2. Configurar e iniciar o site

Em outro terminal:

```bash
cd website
bun install
```

Crie `website/.env.local` apontando para a API local:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3333
```

Inicie o Next.js:

```bash
bun run dev
```

Acesse [http://localhost:3000](http://localhost:3000). A URL da API deve estar configurada também em produção para que o catálogo, os downloads e a geração de licença funcionem.

## API

A documentação OpenAPI da API é servida pelo plugin `@elysiajs/openapi` durante a execução. As principais rotas são:

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/plugins` | Lista os plugins no catálogo PaperMC. |
| `GET` | `/plugins/{slug}/versions` | Lista releases e aceita filtros de versão do Minecraft, versão do plugin, Java, canal Paper e texto de busca. |
| `GET` | `/plugins/{slug}/download` | Baixa o JAR para uma versão do Minecraft e, opcionalmente, uma versão do plugin. |
| `POST` | `/license/generate` | Gera ou recupera a licença padrão do PluginsX. |
| `GET` | `/license/view` | Consulta a licença padrão atual. |
| `GET` | `/license/verify?key={chave}` | Verifica uma chave de licença. |
| `GET` | `/about` | Retorna informações da API. |

Os endpoints de plugins aceitam `platform=paper` (também é o padrão). Outras plataformas não são aceitas. Consulte [`api/README.md`](api/README.md) para exemplos detalhados de filtros e downloads.

## SpawnerX

SpawnerX é um plugin PaperMC que inclui, entre outros recursos:

- comandos administrativos para entregar spawners e recarregar configurações;
- raridades e regras configuráveis para quebra e explosões;
- evolução de spawners em cadeia;
- loja de spawners e anúncios públicos vendidos por XP;
- mensagens externalizadas, incluindo português brasileiro e inglês.

Consulte [`plugins/SpawnerX/README.md`](plugins/SpawnerX/README.md) para comandos, permissões, configuração e compatibilidade detalhadas.

### Compilar e exportar

```bash
cd plugins/SpawnerX
./gradlew check
```

Para exportar os JARs validados e atualizar os manifestos em `builds/`:

```bash
./gradlew exportPlugin
```

A tarefa compartilhada `plugins/gradle/plugin-catalog.gradle.kts` recompõe `builds/releases.json` a partir dos índices individuais. A exportação local não publica uma release externa.

## Verificações

Execute os comandos a partir da raiz do repositório:

```bash
(cd api && bun run typecheck && bun run build)
(cd website && bun run lint && bun run build)
```

## Licença

Este repositório está sob a licença Apache 2.0. Consulte [`LICENSE`](LICENSE).
