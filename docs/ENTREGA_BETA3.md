# Entrega local — Licenciamento 1.0.0-beta.3

Validação em 27/10/2026. Alterações incrementais sobre os sistemas existentes de
Better Auth, MongoDB, licenças, Mercado Pago e interface. A implementação abrange
o repositório principal e o submódulo `plugins`; os JARs exportados estão em
`builds/SpawnerX/1.0.0-beta.3/`.

A [revisão completa de 27/10/2026](REVISAO_PROJETO.md) registra as correções
adicionais, auditoria e verificações realizadas antes do commit.

## Funcionalidades implementadas

- Trial independente de um único acesso pago; mensal e vitalício não coexistem.
- Upgrade com crédito do pagamento mensal real no primeiro mês calendário,
  reserva única e cancelamento confirmado da renovação antes da concessão.
- Gravações de checkout/concessão serializadas por conta e livro financeiro
  protegido contra notificações atrasadas, recusas de outras tentativas e estornos.
- Ativação Ed25519, aprovação com prazo configurável (inicial: 12 minutos),
  idempotência, proteção contra replay, credencial por instalação e heartbeat.
- Reserva transacional de vagas compartilhada por protocolos antigos e novos;
  endpoints legados não autenticam uma instalação beta.3 assinada.
- Administrador Minecraft/console, versões e autenticação; reconfigurações são
  auditadas sem substituir a ativação original. Nenhuma falsa verificação Microsoft.
- IP opcional consentido, criptografado, mascarado e sujeito à retenção/exclusão;
  localização aproximada depende de configuração privada do IPinfo. Uma coleta
  de outro configurador não é atribuída ao administrador original na interface.
- `/account`: inventário, conexão real, modal com quatro abas, administrador,
  avatar/skin com fallback, NameMC e histórico; personalizações existentes preservadas.
- `/panel`: proteção no servidor, catálogo e políticas persistentes, promoções,
  limites, recursos/permissões, revisões e falhas do provedor.
- Retomada do checkout original, inclusive após tentativa recusada/cancelada;
  pagamento aguardando cancelamento e crédito estornado têm estados próprios.
- Plugin beta.3 para os 15 alvos existentes, endpoint HTTPS configurável,
  comunicação assíncrona e tolerância limitada ao vencimento conhecido.

## Migrações efetivamente executadas

A migração aditiva foi executada e repetida **apenas no MongoDB local descartável
em replica set**, pelos testes. Foram validados snapshots de condições aceitas,
limites anteriores preservados e compatibilidade com registros legados.
Nenhuma base de produção foi alterada nesta validação.

Na implantação, a inicialização da API cria os índices e o catálogo ausente,
preenche condições contratuais e titularidade legadas quando há vínculo real,
e importa o último pagamento disponível de compras antigas. Não altera
assinaturas remotas existentes. Consulte [migração e protocolo](LICENCIAMENTO_BETA3.md).

## Verificações

| Verificação | Resultado |
| --- | --- |
| API: domínio e integração com MongoDB real descartável | 83 testes aprovados |
| Website: capacidade, recorrência e recibos | 10 testes aprovados |
| Java: identidade, tolerância, HTTPS, recuperação de pagamentos e recursos existentes | 19 testes aprovados |
| TypeScript/build da API | Aprovado |
| Lint e TypeScript do website | Aprovados |
| Build de produção Next.js | Aprovado; `/panel` com conteúdo dinâmico protegido |
| Gradle `check exportPlugin` | Aprovado; 15 JARs beta.3 conferidos |
| Navegador com API, sessões e MongoDB reais de teste | Validação final da revisão em andamento |

O roteiro de navegador cobre proteção SSR/roles, ativação assinada, aprovação,
poll/heartbeat, revogação, administrador/mídia/histórico, larguras 320/390/768 px,
promoção real, limites contratados preservados, preço dinâmico de vagas e crédito
de upgrade. Um segundo roteiro cobre retomada da URL original, tentativa recusada,
falha de cancelamento e crédito estornado sem oferecer outro pagamento.
As chamadas ao SDK Mercado Pago são substituídas somente nas fixtures dos testes;
a integração de produção continua real.

## Limites técnicos e validação externa

- Gameplay e operações em servidor PaperMC real, callbacks OAuth públicos e
  pagamentos/cancelamentos efetivos Mercado Pago ainda exigem validação no ambiente
  apropriado. Os [passos de aceite](LICENCIAMENTO_BETA3.md#verificação-e-validação-externa)
  estão documentados.
- `VERIFIED` não é atribuído a um jogador somente por UUID, online-mode ou skin.
  Esta versão não implementa prova independente de controle da conta Microsoft.
- Após erro ambíguo ao criar checkout, reservas financeiras ficam preservadas
  até reconciliação do estado no Mercado Pago; não se libera um checkout que
  ainda possa receber pagamento. Crédito estornado exige revisão operacional.
- Geolocalização opcional requer `IPINFO_TOKEN`; sem isso a ativação funciona
  normalmente sem localização. Provedores de mídia indisponíveis usam fallback.
- O build mantém avisos de APIs Paper depreciadas; não houve erro de compilação.

A alteração preexistente de `website/package.json` para `0.4.0` foi preservada.

## Arquivos de implementação e documentação

- [README.md](../README.md)
- [api/.env.example](../api/.env.example)
- [api/README.md](../api/README.md)
- [api/src/database/models/License.ts](../api/src/database/models/License.ts)
- [api/src/database/models/LicenseServer.ts](../api/src/database/models/LicenseServer.ts)
- [api/src/database/models/LicenseServerEvent.ts](../api/src/database/models/LicenseServerEvent.ts)
- [api/src/database/models/LicensingConfiguration.ts](../api/src/database/models/LicensingConfiguration.ts)
- [api/src/database/models/PlanAccess.ts](../api/src/database/models/PlanAccess.ts)
- [api/src/database/models/PlanPurchase.ts](../api/src/database/models/PlanPurchase.ts)
- [api/src/domain/activation.ts](../api/src/domain/activation.ts)
- [api/src/domain/licensing-config.ts](../api/src/domain/licensing-config.ts)
- [api/src/domain/licensing-v3.test.ts](../api/src/domain/licensing-v3.test.ts)
- [api/src/domain/upgrade.ts](../api/src/domain/upgrade.ts)
- [api/src/http/plugins/activation-privacy.ts](../api/src/http/plugins/activation-privacy.ts)
- [api/src/http/plugins/activation-service.ts](../api/src/http/plugins/activation-service.ts)
- [api/src/http/plugins/billing-config.ts](../api/src/http/plugins/billing-config.ts)
- [api/src/http/plugins/billing-entitlements.ts](../api/src/http/plugins/billing-entitlements.ts)
- [api/src/http/plugins/billing-lock.ts](../api/src/http/plugins/billing-lock.ts)
- [api/src/http/plugins/billing-payment-ledger.ts](../api/src/http/plugins/billing-payment-ledger.ts)
- [api/src/http/plugins/licensing-config.ts](../api/src/http/plugins/licensing-config.ts)
- [api/src/http/plugins/licensing-v3.integration.test.ts](../api/src/http/plugins/licensing-v3.integration.test.ts)
- [api/src/http/plugins/rate-limit.ts](../api/src/http/plugins/rate-limit.ts)
- [api/src/http/plugins/subscription-access.ts](../api/src/http/plugins/subscription-access.ts)
- [api/src/http/plugins/upgrade.ts](../api/src/http/plugins/upgrade.ts)
- [api/src/http/routes/activation.ts](../api/src/http/routes/activation.ts)
- [api/src/http/routes/billing.ts](../api/src/http/routes/billing.ts)
- [api/src/http/routes/license-servers.ts](../api/src/http/routes/license-servers.ts)
- [api/src/http/routes/licensing-admin.ts](../api/src/http/routes/licensing-admin.ts)
- [api/src/http/routes/minecraft-media.ts](../api/src/http/routes/minecraft-media.ts)
- [api/src/http/routes/panel.ts](../api/src/http/routes/panel.ts)
- [api/src/server.ts](../api/src/server.ts)
- [docs/LICENCIAMENTO_BETA3.md](../docs/LICENCIAMENTO_BETA3.md)
- [docs/REVISAO_PROJETO.md](../docs/REVISAO_PROJETO.md)
- [website/README.md](../website/README.md)
- [website/app/panel/page.tsx](../website/app/panel/page.tsx)
- [website/components/account/ServerDetailsDialog.tsx](../website/components/account/ServerDetailsDialog.tsx)
- [website/components/cart/CartProvider.tsx](../website/components/cart/CartProvider.tsx)
- [website/components/cart/PendingCheckout.tsx](../website/components/cart/PendingCheckout.tsx)
- [website/components/pages/AccountPage.tsx](../website/components/pages/AccountPage.tsx)
- [website/components/pages/CartPage.tsx](../website/components/pages/CartPage.tsx)
- [website/components/pages/PanelPage.tsx](../website/components/pages/PanelPage.tsx)
- [website/components/pages/PlansPage.tsx](../website/components/pages/PlansPage.tsx)
- [website/components/panel/LicensingManagement.tsx](../website/components/panel/LicensingManagement.tsx)
- [website/components/ui/PlanPromotion.tsx](../website/components/ui/PlanPromotion.tsx)
- [website/lib/commercial-display.test.ts](../website/lib/commercial-display.test.ts)
- [website/lib/commercial-display.ts](../website/lib/commercial-display.ts)
- [website/lib/purchase-receipts.test.ts](../website/lib/purchase-receipts.test.ts)
- [website/lib/purchase-receipts.ts](../website/lib/purchase-receipts.ts)
- [website/styles/globals.css](../website/styles/globals.css)
- [website/styles/licensing-management.css](../website/styles/licensing-management.css)
- [plugins/SpawnerX/CHANGELOG.md](../plugins/SpawnerX/CHANGELOG.md)
- [plugins/SpawnerX/README.md](../plugins/SpawnerX/README.md)
- [plugins/SpawnerX/build.gradle.kts](../plugins/SpawnerX/build.gradle.kts)
- [plugins/SpawnerX/gradle.properties](../plugins/SpawnerX/gradle.properties)
- [plugins/SpawnerX/src/main/java/com/pluginsx/SpawnerX.java](../plugins/SpawnerX/src/main/java/com/pluginsx/SpawnerX.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/commands/SpawnerXCommand.java](../plugins/SpawnerX/src/main/java/com/pluginsx/commands/SpawnerXCommand.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/listeners/AdminSpawnerMenuListener.java](../plugins/SpawnerX/src/main/java/com/pluginsx/listeners/AdminSpawnerMenuListener.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/listeners/PlayerPayoutListener.java](../plugins/SpawnerX/src/main/java/com/pluginsx/listeners/PlayerPayoutListener.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/listeners/SpawnerShopListener.java](../plugins/SpawnerX/src/main/java/com/pluginsx/listeners/SpawnerShopListener.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/listeners/SpawnerUpgradeListener.java](../plugins/SpawnerX/src/main/java/com/pluginsx/listeners/SpawnerUpgradeListener.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/ActivationIdentity.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/ActivationIdentity.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/AuthorizationLease.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/AuthorizationLease.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/LicenseApiOrigin.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/LicenseApiOrigin.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/LicenseManager.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/LicenseManager.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/PublicSalesManager.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/PublicSalesManager.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/SpawnerShopManager.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/SpawnerShopManager.java)
- [plugins/SpawnerX/src/main/java/com/pluginsx/managers/TradeManager.java](../plugins/SpawnerX/src/main/java/com/pluginsx/managers/TradeManager.java)
- [plugins/SpawnerX/src/main/resources/config.yml](../plugins/SpawnerX/src/main/resources/config.yml)
- [plugins/SpawnerX/src/main/resources/locale/en_US.yml](../plugins/SpawnerX/src/main/resources/locale/en_US.yml)
- [plugins/SpawnerX/src/main/resources/locale/pt_BR.yml](../plugins/SpawnerX/src/main/resources/locale/pt_BR.yml)
- [plugins/SpawnerX/src/test/java/com/pluginsx/commands/SpawnerXCommandPolicyTest.java](../plugins/SpawnerX/src/test/java/com/pluginsx/commands/SpawnerXCommandPolicyTest.java)
- [plugins/SpawnerX/src/test/java/com/pluginsx/managers/ActivationIdentityTest.java](../plugins/SpawnerX/src/test/java/com/pluginsx/managers/ActivationIdentityTest.java)
- [plugins/SpawnerX/src/test/java/com/pluginsx/managers/AuthorizationLeaseTest.java](../plugins/SpawnerX/src/test/java/com/pluginsx/managers/AuthorizationLeaseTest.java)
- [plugins/SpawnerX/src/test/java/com/pluginsx/managers/LicenseApiOriginTest.java](../plugins/SpawnerX/src/test/java/com/pluginsx/managers/LicenseApiOriginTest.java)

Os 15 JARs e os índices `builds/SpawnerX/releases.json` e `builds/releases.json`
foram atualizados, mantendo as releases anteriores. A versão preexistente de
`website/package.json` também integra o commit sem alteração adicional.
