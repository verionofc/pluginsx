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

A autenticação aceita OAuth por GitHub e Discord; login/cadastro por e-mail e
senha fica desativado. GitHub é obrigatório. Discord só fica disponível quando
`DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` estão definidos juntos. O Better
Auth usa `URL` como origem pública em produção e `DEV_URL` em desenvolvimento.
O site encaminha `/auth/*` para esta API, mantendo os cookies de autenticação na
origem do site. `URL` e `DEV_URL` também são as origens web aceitas.

**O callback usa a origem do site, não a porta da API.** Localmente, o site
roda em `http://localhost:3000` e encaminha `/auth/*` para a API em
`http://localhost:3333`. Cadastre
`http://localhost:3000/auth/callback/discord` no Discord; a porta `3333` não é
o endereço de callback do navegador.

Configure os callbacks nas aplicações OAuth:

```text
${URL}/auth/callback/github
${DEV_URL}/auth/callback/github
${URL}/auth/callback/discord
${DEV_URL}/auth/callback/discord
```

O status público dos provedores, sem expor credenciais, fica disponível em
`GET /about/`. Contas Discord que não fornecem e-mail recebem um endereço
placeholder determinístico baseado no ID Discord, apenas para cumprir o campo
obrigatório do Better Auth; esse endereço não é uma caixa de e-mail válida.

O início do fluxo é feito pelo endpoint social do Better Auth, com o cookie de
sessão persistido no MongoDB:

```text
POST /auth/sign-in/social
{ "provider": "github" | "discord", "callbackURL": "https://pluginsx.vercel.app" }

GET  /auth/get-session
POST /auth/sign-out
GET  /me
```

O `provider` deve ser `github` ou `discord`. Clientes web em outra origem
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
O arquivo [`plans.json`](plans.json) é a fonte única para moeda,
preços, nomes, recorrência, duração do Trial, limites de servidores e preço e
quantidade máxima das vagas extras. `/billing/catalog`, a criação de checkout e
a validação do limite de licenças leem essa configuração; altere o JSON e
reinicie a API para aplicar os valores novos. O checkout sempre calcula o total
no servidor, sem confiar em valores enviados pelo navegador. Novos preços se
aplicam a novos checkouts; assinaturas existentes mantêm o valor acordado no
Mercado Pago. Textos promocionais estáticos do site não fazem parte deste
catálogo e exigem atualização própria no front-end quando os preços forem
alterados.

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
`ownerId`, válida pela duração configurada em `plans.json`. A key fica salva no armazenamento local do
navegador e pode ser recuperada pela própria conta enquanto estiver válida. O
código de recuperação fica associado ao estado da conta somente durante a janela
configurada; ao expirar, a API deixa de retorná-lo e remove o código salvo. A
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
POST /billing/trial                 # requer sessão; opcional; duração definida em plans.json
POST /billing/checkout              # requer sessão; { "plan": "monthly" | "lifetime" | "aether" | "server_slots", "serverSlots"?: number }
POST /billing/cancel                # requer sessão; cancela a renovação mensal
POST /billing/webhook               # validação de assinatura do Mercado Pago
GET  /billing/purchase/{reference}  # requer sessão e propriedade da compra
```

## Painel do proprietário

`/panel` no site usa endpoints que exigem sessão Better Auth com a role `owner`;
todos verificam essa role no servidor. O ID configurado em
`src/config/roles.ts` é promovido para `owner` na inicialização da API. O painel
mostra receita confirmada, receita mensal, assinaturas recorrentes ativas,
compras por conta, cobranças e logs. O livro financeiro registra cada pagamento
recebido pelo webhook; compras antigas são importadas a partir dos dados ainda
salvos em `PlanPurchase`, que pode manter apenas o pagamento mais recente de
cada assinatura mensal.

```text
GET  /panel/dashboard
GET  /panel/accounts?limit=25&offset=0 # contas com total por produto
GET  /panel/transactions?limit=25&offset=0
GET  /panel/activity
POST /panel/accounts/lookup  # { "identifier": "ID MongoDB ou e-mail" }
POST /panel/accounts/access  # plano, vencimento mensal e limite ou ilimitado
```

O painel não consulta nem retorna chaves de licença. Alterações de plano ficam
registradas em `AdminAuditLog`; trocar ou revogar uma assinatura mensal também
cancela a renovação no Mercado Pago quando há uma assinatura vinculada. A role
owner não concede acesso premium automaticamente; o acesso de plano é um dado
separado, gerenciado pelo painel.

Keys Plus são autorizadas pela existência de um plano pago ativo configurado em
`plans.json`. Essa mesma regra alimenta a validação pública da key, inclusive
após o vencimento ou reembolso/contestação. O limite-base de cada plano e o
limite do Trial também vêm desse arquivo; vagas extras aprovadas somam-se ao
limite do plano pago e deixam de contar quando a compra é reembolsada ou
contestada. Cancelar uma assinatura mantém o acesso e as vagas extras até o fim
do período registrado como pago.
