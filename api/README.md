# PluginsX API

API oficial do PluginsX, voltada exclusivamente ao ecossistema **PaperMC**.
Os plugins e downloads oferecidos pela API são destinados a Paper; outros
softwares de servidor Minecraft não são suportados.

## Catálogo e downloads PaperMC

O catálogo global [`builds/releases.json`](https://github.com/verionofc/pluginsx/blob/main/builds/releases.json)
lista os plugins publicados e o caminho curto para o índice de cada um, por exemplo
`SpawnerX/releases.json`. Cada índice detalhado lista versões Minecraft e caminhos dos
artefatos. Os projetos Gradle geram seus índices individuais; o script compartilhado
`plugins/gradle/plugin-catalog.gradle.kts` reúne todos eles automaticamente.

```text
GET /plugins
GET /plugins/{plugin}/versions
GET /plugins/{plugin}/versions?minecraft=26.2
GET /plugins/{plugin}/versions?java=25&paperChannel=ALPHA
GET /plugins/{plugin}/versions?pluginVersion=1.0.0-beta.1
GET /plugins/{plugin}/download?minecraft=26.2&pluginVersion=1.0.0-beta.1
```

Use o `slug` retornado por `GET /plugins` para preencher `{plugin}`. O endpoint de
versões também aceita `pluginVersion`, `java`, `paperChannel` e `q`; os valores
disponíveis e requisitos Java são lidos do índice individual de cada plugin, sem
uma lista de versões mantida manualmente na API.

O parâmetro `platform` aceita `paper` (e assume esse valor quando omitido).
Pedidos para outras plataformas ou versões sem release compatível são
recusados. `downloadUrl` é relativo à origem da API. A rota de download retorna
o JAR como anexo e informa a versão selecionada nos cabeçalhos
`X-Plugin-Version`, `X-Minecraft-Version`, `X-Server-Platform`,
`X-Java-Version` e `X-Paper-Channel`.

## Login social

A autenticação aceita somente OAuth por GitHub; login/cadastro por e-mail e
senha fica desativado. Configure `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`
junto com `BETTER_AUTH_SECRET` (mínimo de 32 caracteres). O Better Auth usa
`URL` como origem pública em produção e `DEV_URL` em desenvolvimento. O site
encaminha `/auth/*` para esta API, mantendo os cookies de autenticação na
origem do site. `URL` e `DEV_URL` também são as origens web aceitas.

Cadastre estes callbacks nas aplicações OAuth dos provedores:

```text
${URL}/auth/callback/github
```

O início do fluxo é feito pelo endpoint social do Better Auth, com o cookie de
sessão persistido no MongoDB:

```text
POST /auth/sign-in/social
{ "provider": "github", "callbackURL": "https://pluginsx.vercel.app" }

GET  /auth/get-session
POST /auth/sign-out
GET  /me
```

O `provider` deve ser `github`. Clientes web em outra origem
precisam enviar cookies (`fetch` com `credentials: "include"`); `/me` retorna o
usuário autenticado ou `401` quando não há sessão válida.

## Key Premium por conta

Uma conta autenticada pode gerar ou recuperar a própria key Plus com:

```text
POST /license/premium/generate
```

Envie o cookie de sessão. O endpoint retorna uma key `plus_...`; chamadas
repetidas recuperam a mesma key. Um índice único no MongoDB por usuário mantém
essa regra mesmo quando duas solicitações chegam ao mesmo tempo. Sem sessão, a
API responde `401`.

O SpawnerX consulta `GET /license/tier?key={chave}` para validar a licença e
identificar se ela libera recursos `default` ou `plus`. O endpoint `/license/verify`
continua disponível para clientes que só precisam saber se a chave é válida.
