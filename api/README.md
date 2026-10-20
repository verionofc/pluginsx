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
