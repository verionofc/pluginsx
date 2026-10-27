# Compra, confirmação e keys independentes

Correção do fluxo Trial → Ender Dragon e do acompanhamento de Pix em 27/10/2026.

A concessão anterior atualizava `PlanAccess`, mas não emitia a key paga. O
inventário listava apenas keys existentes e a presença do Trial ocultava a
opção de geração manual. Além disso, a compra podia aparecer como aprovada
antes da emissão, e a interface só consultava retornos com referência na URL
por um período curto.

## Comportamento implementado

- Trial e cada plano pago possuem uma key própria e um card correspondente.
  Mensal e vitalício continuam mutuamente exclusivos como acessos ativos.
- A concessão paga e a emissão da key usam a mesma transação. O inventário
  também recupera automaticamente keys ausentes de acessos pagos já ativos.
  A emissão recuperada pode ser apresentada como conquista sem alterar a data
  financeira original da compra nem repetir recibos de keys antigas.
- Keys anteriores e seus servidores são preservados. Uma key mensal não passa
  a autorizar um vitalício: o novo plano recebe sua própria key e vinculações.
- A consulta autenticada do pedido diferencia pagamento e entrega. O site só
  anuncia a aquisição quando o acesso está pronto e a key realmente existe.
- A confirmação utiliza a arte do plano, um recibo e uma animação de conquista.
  O inventário atualiza e destaca o card certo, sem trocar a key do Trial.
- A referência do pedido fica salva por conta, sem a key. Consulta automática,
  retorno de foco e redescoberta do pedido permitem voltar sem parâmetros na URL.
- O checkout abre em janela própria a partir da ação do usuário. Caso o navegador
  a bloqueie, a referência é salva antes do redirecionamento tradicional.

## Pix e reconciliação

O retorno automático da preferência documentado pelo Mercado Pago atende
pagamentos aprovados com cartão. O acompanhamento do Pix, portanto, não depende
exclusivamente de um redirecionamento do provedor.
[Referência oficial da preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/get-preference/get).

`GET /billing/purchase/{reference}` exige a sessão do titular. Quando necessário,
a API busca o pagamento pela referência persistida, consulta seu recurso completo
no provedor e reutiliza o mesmo processamento do webhook. Valor, moeda e vínculo
da compra são validados; parâmetros de retorno como `status=approved` não liberam
acesso. Consultas externas têm timeout e reserva persistente para limitar retries.

Pagamento recebido com emissão interrompida permanece em preparação e pode ser
concluído sem cobrar novamente. Falhas ao encerrar a renovação mensal também
permanecem em preparação, sem oferecer outro pagamento. Estornos e revisões
impedem a animação de sucesso.

O histórico financeiro também é conferido durante emissão, inventário e
autorização. Um estorno já persistido bloqueia a key mesmo se a atualização
do resumo do pedido tiver sido interrompida. No mensal, uma fatura antiga já
vencida não sustenta o período de uma cobrança posterior estornada. Outra
tentativa realmente aprovada continua válida pelo período que ela pagou.

## Migração e implantação

Na inicialização, `migratePlanLicenseIndexes()` normaliza Trials antigos com
vencimento, preserva suas keys e servidores, preenche planos legados quando há
associação real e cria `one_paid_key_per_account_plan` em `(ownerId, sourcePlan)`.
Somente depois remove o índice antigo de unicidade por conta. A migração é
idempotente e deve anteceder o atendimento de solicitações de emissão.

A atualização requer API e website compatíveis. Após implantar a API, abrir o
inventário recupera a key que estiver faltando de um acesso pago ativo; pedidos
que ainda precisam de confirmação são reconciliados pela consulta do pedido.
Esta implementação local não acessou a conta real do cliente nem alterou dados
ou cobranças de produção.

## Validação

- 93 testes da API aprovados, incluindo pagamento após Trial, duas keys distintas,
  migração de índice, busca de Pix sem webhook, concorrência, titularidade,
  valores incompatíveis, timeout, recuperação após interrupção da emissão e
  estornos com resumo desatualizado, inclusive por período mensal.
- 15 testes do website aprovados, incluindo sucesso condicionado à emissão,
  referência por conta, retorno sem URL, deduplicação e navegação segura.
- TypeScript e build de produção aprovados.
- Navegador com API, sessões e MongoDB reais de teste: checkout em janela própria,
  ausência de falso sucesso por parâmetros, confirmação sem webhook, dois cards,
  key paga distinta, recibo único, retorno sem URL, mobile e movimento reduzido.
  Apenas o provedor externo foi simulado nas fixtures; produção usa o SDK real.
- Better Auth e adaptador MongoDB atualizados para 1.7.7; auditorias da API e do
  website sem vulnerabilidades reportadas na base consultada nesta revisão.

O pagamento no provedor real continua sujeito à validação no ambiente apropriado.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Keys e migração | `api/src/http/plugins/paid-plan-license.ts`, `api/src/database/models/License.ts`, `api/src/server.ts` |
| Entrega e confirmação | `api/src/http/plugins/billing-entitlements.ts`, `billing-payment-processing.ts`, `billing-purchase-status.ts`, `api/src/http/routes/billing.ts` |
| Validade e inventário | `api/src/http/plugins/plan-access.ts`, `billing-payment-ledger.ts`, `license.ts`, `activation-service.ts`, `api/src/http/routes/license-servers.ts` |
| Jornada de compra | `website/components/cart/PurchaseJourneyProvider.tsx`, `PurchaseProgress.tsx`, `PurchaseArrival.tsx`, `website/lib/purchase-progress.ts`, `website/styles/purchase-progress.css` |
| Páginas | `website/app/layout.tsx`, `website/components/pages/AccountPage.tsx`, `CartPage.tsx`, `PlansPage.tsx` |
| Regressões | `api/src/http/plugins/licensing-v3.integration.test.ts`, `website/lib/purchase-progress.test.ts` |
| Dependências | `api/package.json`, `api/bun.lock`, `website/package.json`, `website/bun.lock` |

Os demais arquivos alterados documentam os fluxos e conectam a nova folha de
estilos ao design existente. O relatório completo está em `REVISAO_PROJETO.md`.
