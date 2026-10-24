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


## Planos e pagamentos

O site expõe `/plans`; os endpoints `/billing/*` são autenticados pelo mesmo
Better Auth e persistem acesso, compras e notificações no MongoDB/Mongoose.
Os preços do catálogo e do checkout são definidos somente na API: R$ 12,53 por
mês e R$ 63,04 no Lifetime. O endpoint de checkout recebe apenas o identificador
do plano; valores enviados pelo navegador não são aceitos como autoridade.

Configure no ambiente privado da API:

```dotenv
MERCADOPAGO_ACCESS_TOKEN=APP_USR-... # ou credencial de teste no ambiente sandbox
MERCADOPAGO_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://pluginsx.vercel.app
TEMP_LICENSE_TRIAL_ENABLED=false
```

O teste de licença temporária vem desativado. Para exibir o cartão de teste em
`/plans`, defina `TEMP_LICENSE_TRIAL_ENABLED=true` no ambiente da API e reinicie
o serviço. O endpoint autenticado `/billing/trial` gera uma key Plus sem
`ownerId`, válida por 12 horas. A key fica salva no armazenamento local do
navegador e pode ser recuperada pela própria conta enquanto estiver válida. O
código de recuperação fica associado ao estado da conta somente durante a janela
de 12 horas; ao expirar, a API deixa de retorná-lo e remove o código salvo. A
licença não recebe `ownerId`, e uma segunda emissão é bloqueada mesmo após a
expiração. O MongoDB remove a licença expirada por TTL.
Para ocultar o teste, volte a variável para `false` e reinicie a API.

Use credenciais de teste em implantação de sandbox e credenciais de produção
somente no deployment de produção. Nunca configure o Access Token como variável
`NEXT_PUBLIC_*` no website. No painel do Mercado Pago, cadastre a URL
`${URL}/billing/webhook` como destino e habilite os tópicos `payment`,
`subscription_preapproval`, `subscription_authorized_payment` e
`topic_chargebacks_wh`. O Mercado Pago documenta que cobranças recorrentes
precisam dos tópicos de pagamento e de fatura autorizada; consulte a
[documentação oficial de Webhooks de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
e a [referência da API de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get).
O endpoint verifica `x-signature` e `x-request-id` com o validador do SDK oficial,
consulta o recurso diretamente na API do Mercado Pago e persiste deduplicação no
MongoDB. O retorno de checkout só apresenta o estado consultado no backend; não
concede acesso. Rode `bun run test` para os testes de configuração de preço,
retorno seguro e validação de assinatura HMAC.

Endpoints de gerenciamento:

```text
GET  /billing/catalog
GET  /billing/state                 # requer sessão
POST /billing/trial                 # requer sessão; opcional; key temporária de 12h
POST /billing/checkout              # requer sessão; { "plan": "monthly" | "lifetime" }
POST /billing/cancel                # requer sessão; cancela a renovação mensal
POST /billing/webhook               # validação de assinatura do Mercado Pago
GET  /billing/purchase/{reference}  # requer sessão e propriedade da compra
```

Keys Plus são autorizadas pela existência de um plano mensal válido ou Lifetime
ativo. Essa mesma regra alimenta a validação pública da key, inclusive após o
vencimento ou reembolso/contestação. Cancelar uma assinatura mantém o acesso até
o fim do período registrado como pago.
