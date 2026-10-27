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
repetidas recuperam a mesma key do plano ativo. O índice único por conta e plano
no MongoDB mantém essa regra em solicitações concorrentes. Trial e cada plano
pago possuem keys independentes; a licença paga é emitida automaticamente na
concessão e o inventário recupera keys ausentes de acessos já confirmados.
Sem sessão, a API responde `401`.

O SpawnerX beta.3 mantém a consulta `/license/tier` para a licença base
`default`. Licenças Plus usam o protocolo de instalação assinado descrito abaixo;
validar a key isoladamente não autoriza um servidor. `/license/verify` e
`/license/tier` permanecem disponíveis para compatibilidade.


## Planos e pagamentos

O site expõe `/plans`; os endpoints `/billing/*` são autenticados pelo mesmo
Better Auth e persistem acesso, compras e notificações no MongoDB/Mongoose.
A configuração comercial e as políticas de licenciamento são persistidas em
`LicensingConfiguration` e editadas em `/panel`. O arquivo
[`plans.json`](plans.json) fornece somente os valores iniciais de uma base sem
configuração; editar esse JSON após a migração não altera o catálogo ativo.
A API atualiza seu cache em até cinco segundos e avalia a vigência das promoções
no servidor. Alterações salvas não exigem rebuild.

Preços base e promocionais do catálogo são inteiros em centavos. O backend
calcula o total, aplica cupons e crédito de upgrade e recusa um orçamento
`expectedTotalCents` desatualizado. Cada contratação guarda `planTerms`, com a
revisão comercial aceita. Preços e limites de contratos existentes permanecem
preservados; editar uma oferta não modifica uma assinatura Mercado Pago já
contratada. A estratégia `new_contracts_only` registra a entrega ou falha ao criar
cada novo contrato no provedor.

Trial e um plano pago podem coexistir. Mensal e vitalício compartilham um único
acesso pago por conta. O upgrade para Lifetime/Aether cancela a renovação mensal
antes de conceder o acesso permanente. Durante o primeiro mês calendário da
primeira mensalidade comprovada, o crédito usa o valor efetivamente aprovado,
inclusive descontos, limitado ao preço do destino e reservado uma única vez.
Não há crédito presumido para concessões administrativas ou pagamentos legados
sem evidência suficiente. Veja os detalhes operacionais na
[documentação beta.3](../docs/LICENCIAMENTO_BETA3.md).

Configure no ambiente privado da API:

```dotenv
MERCADOPAGO_ACCESS_TOKEN=APP_USR-... # ou credencial de teste no ambiente sandbox
MERCADOPAGO_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://pluginsx.vercel.app
TEMP_LICENSE_TRIAL_ENABLED=false
```

`TEMP_LICENSE_TRIAL_ENABLED` controla apenas a disponibilidade inicial do Trial
na criação da configuração. Depois, habilitação, visibilidade, duração e limite
são controlados pelo painel. `/billing/trial` emite uma licença Plus independente,
recuperável pela própria conta enquanto estiver válida. A segunda emissão fica
bloqueada mesmo após expirar. O MongoDB remove a key expirada por TTL; a
expiração é verificada pela API sem depender do momento dessa limpeza.

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
POST /billing/trial                 # requer sessão; oferta/duração definidas no painel
POST /billing/coupon/validate        # requer sessão; { plan, serverSlots, couponCode }
POST /billing/checkout              # requer sessão; { plan, serverSlots?, couponCode?, returnTo?, expectedTotalCents? }
POST /billing/cancel                # requer sessão; cancela a renovação mensal
POST /billing/webhook               # validação de assinatura do Mercado Pago
GET  /billing/purchase/{reference}  # sessão/propriedade; reconciliação e estado de pagamento + emissão
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
GET  /panel/coupons
POST /panel/coupons                  # produtos pagos, desconto, limites e validade
POST /panel/coupons/{id}/active      # { "active": boolean }
GET  /panel/dashboard
GET  /panel/accounts?limit=25&offset=0 # contas com total por produto
GET  /panel/transactions?limit=25&offset=0
GET  /panel/activity
POST /panel/accounts/lookup  # { "identifier": "ID MongoDB ou e-mail" }
POST /panel/accounts/access  # plano, vencimento mensal e limite ou ilimitado
GET  /panel/licensing              # configuração, revisões, alertas e entrega ao provedor
PATCH /panel/plans/{id}             # plano + expectedVersion, reason, confirm
PATCH /panel/licensing/settings     # políticas/vagas + expectedVersion, reason, confirm
```

O painel não consulta nem retorna chaves de licença. Alterações de plano ficam
registradas em `AdminAuditLog`; trocar ou revogar uma assinatura mensal também
cancela a renovação no Mercado Pago quando há uma assinatura vinculada. A role
owner não concede acesso premium automaticamente; o acesso de plano é um dado
separado, gerenciado pelo painel.

Keys Plus dependem de acesso vigente no backend, inclusive após expiração,
reembolso ou contestação. Vagas extras aprovadas somam-se ao limite aceito do
plano pago. Reduzir um limite no catálogo não remove servidores existentes.
Uma redução explícita de limite de uma conta impede novas aprovações acima da
capacidade, preservando as vinculações existentes. Cancelar a renovação mantém
o acesso durante o período já pago.

## Instalações beta.3

O plugin assina os pedidos com uma identidade Ed25519 própria. A API verifica a
assinatura, timestamp e nonce, registra a solicitação idempotente e exige
aprovação do titular autenticado. A validade inicial é de 12 minutos, ajustável
no painel. Após aprovação, somente a instalação correspondente recebe uma
credencial; o banco guarda seu hash. Heartbeats assinados e autenticados
determinam a comunicação recente separadamente do estado da autorização.

```text
POST /license/servers/activation-requests # envelope assinado; cria/recupera pedido
POST /license/servers/poll                # envelope assinado; consulta aprovação
POST /license/servers/heartbeat           # envelope + Bearer da instalação
POST /license/servers/privacy             # exclusão opcional pelo configurador
GET  /license/servers                     # inventário do titular autenticado
GET  /license/servers/{id}                # detalhes/histórico do titular
POST /license/servers/{id}/approve        # { confirm: true }
POST /license/servers/{id}/reject          # { confirm: true }
POST /license/servers/{id}/remove          # { confirm: true }; revoga vinculação
DELETE /license/servers/{id}/privacy       # { confirm: true }; titular
```

As rotas mantêm o prefixo existente `/license/servers`; não foi criado um segundo
sistema em `/api/licenses`. Os endpoints legados `/request` e `/status` são
preservados conforme a política de compatibilidade. Eles não recebem credenciais
beta.3 nem comprovam identidade de uma instalação assinada.

As informações públicas do configurador são declaradas pela instalação e ficam
`UNVERIFIED`; console recebe `NOT_APPLICABLE`. `onlineMode`, modo de autenticação
e confiança no encaminhamento do proxy são registrados separadamente.
UUID, skin ou servidor em modo online não representam verificação independente
da conta Microsoft. Avatar e skin usam proxy de mídia com UUID validado,
cache e fallback local; o perfil NameMC usa esse identificador público.

A coleta opcional de IP fica desativada inicialmente. Exige política do backend,
configuração local e consentimento informado do jogador na versão vigente.
IP é criptografado com AES-256-GCM; a interface recebe somente máscara e
localização aproximada. `IPINFO_TOKEN` privado é necessário para habilitar a
consulta opcional de região/cidade. O serviço continua funcionando sem esses
dados. Retenção, exclusão e migrações estão detalhadas no
[guia beta.3](../docs/LICENCIAMENTO_BETA3.md).

## Cupons e identificação de servidores

Cupons aceitam somente produtos pagos: `monthly`, `lifetime`, `aether` e
`server_slots`. O painel define desconto percentual ou fixo, produtos elegíveis,
início, término, uso único global, vários resgates ou limite por conta. Cupons
por conta exigem uma data final. O Trial não aceita cupons. O desconto do mensal
é recorrente durante a assinatura contratada; a data final do cupom encerra
novas adesões, sem alterar contratos já autorizados no Mercado Pago.

Orçamentos e rateio usam centavos inteiros e mantêm pelo menos R$ 0,01 no total
elegível. Itens integralmente descontados são omitidos no checkout. Reservas,
contadores globais, limites por conta e confirmação do resgate são atualizados
em transações MongoDB. O índice único da referência da compra impede duplicação.
Pagamentos cancelados isolados e assinaturas pausadas ou canceladas mantêm a
reserva: links podem continuar pagáveis e cobranças anteriores ainda podem
ser liquidadas. Erros de rede ambíguos após solicitar
um checkout também preservam a reserva. Ainda não há reconciliação automática
para reservas de checkouts abandonados: confira o estado no provedor antes de
intervir nos contadores.

`PATCH /license/servers/{id}/appearance` aceita apenas `displayName`, `tags`,
`icon` e `pinned`. Exige sessão, origem web permitida, propriedade da licença
(ou Trial válido) e servidor em estado `ACTIVE`. Atualizações parciais preservam
os campos ausentes. Os endpoints públicos usados pelo plugin não retornam essas
preferências privadas.

Os testes de transações podem usar uma instância MongoDB local descartável em
replica set, com um banco chamado `pluginsx_coupon_test`:

```bash
COUPON_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/pluginsx_coupon_test?replicaSet=test' bun test src
```

Essa opção limpa as coleções usadas pelas fixtures entre cenários, incluindo
dados de sessão, licenciamento e cobrança. Rejeita URLs remotas ou outros nomes
de banco. Nunca aponte a suíte para uma base utilizada por outro serviço. Sem a variável, os testes de integração são
omitidos e os testes de domínio continuam executando normalmente.

A confirmação usa `paymentStatus` e `fulfillmentStatus` separados. O website só
anuncia a aquisição após `ready` e a presença da referência da licença. Veja
[compra e keys independentes](../docs/COMPRA_LICENCAS_INDEPENDENTES.md).
