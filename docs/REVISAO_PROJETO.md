# Revisão técnica do PluginsX

Data: 27/10/2026. Escopo: website Next.js, API Elysia/Mongoose, Better Auth,
planos, pagamentos e cupons, ativação e privacidade, plugin SpawnerX,
configuração Gradle, artefatos PaperMC e documentação. A revisão atual cobre
as alterações desde `10f48a2`, com foco em keys independentes, confirmação de
compra, estornos e atualização de segurança. O plugin permanece no submódulo
`4d8c271`, sem alterações nesta entrega.

## Arquitetura e regras conferidas

- Better Auth e MongoDB continuam responsáveis por sessão e titularidade.
  `/panel` valida a sessão no servidor e cada endpoint exige `owner`.
- O catálogo persistente é a autoridade comercial; `api/plans.json` fornece o
  seed inicial. Contratos guardam condições aceitas, preservando preços e limites.
- Trial pode coexistir com um plano pago. Mensal e vitalício compartilham um
  acesso pago; crédito de upgrade depende do pagamento real, da assinatura e
  da primeira janela mensal, com reserva única.
- Cada plano possui sua própria key. Concessão paga e emissão ocorrem na mesma
  transação; o inventário recupera keys ausentes de acessos pagos anteriores.
  A key Trial e suas vinculações continuam independentes do plano comprado.
- O checkout calcula valores no backend. O retorno do navegador não concede
  acesso; webhook e consulta autenticada de recibo verificam o recurso no
  Mercado Pago pelo mesmo processador. A interface distingue pagamento recebido
  de licença efetivamente emitida.
- Gravações financeiras usam serialização por conta, histórico por pagamento e
  proteção contra notificações atrasadas. Cancelamento de renovação antecede
  a concessão do upgrade.
- Instalações beta.3 usam Ed25519, nonce, idempotência, aprovação pelo titular,
  credencial por servidor e heartbeat. O protocolo antigo não autentica uma
  instalação assinada; os dois protocolos compartilham reserva transacional.
- Nome/UUID públicos e autenticação declarada não são prova de titularidade
  Microsoft. IP opcional exige consentimento e configuração, usa criptografia,
  máscara e retenção. Exclusão e política são revalidadas antes da gravação.
- O site preserva os temas, fundo, componentes e identificação privada dos
  servidores. Preços, promoções e recorrência vêm do catálogo real.
- SpawnerX faz rede assíncrona, limita tolerância ao vencimento conhecido e
  mantém pagamentos/devoluções já devidos após expiração da licença.
- Gradle separa `check` de exportação; os 15 alvos beta.3 mantêm os metadados
  corretos e o histórico de releases anteriores.

## Problemas encontrados e corrigidos na revisão atual

| Área | Problema confirmado | Correção |
| --- | --- | --- |
| Entrega | Uma compra paga atualizava o acesso, mas não emitia a key; o Trial existente podia esconder a geração manual. | Emissão transacional e idempotente por conta/plano, recuperação no inventário e índice composto, preservando keys e servidores. |
| Identidade da licença | A resolução pelo plano atual da conta podia fazer uma key antiga representar outro plano. | Validação exige o plano da própria key; upgrade emite a key correspondente e mantém o histórico anterior. |
| Confirmação Pix | Consulta limitada ao retorno por URL podia acabar antes do pagamento; o cliente continuava na tela do provedor sem atualização do inventário. | Referência persistida por conta, acompanhamento global, retomada por foco e consulta do pagamento real quando falta webhook. |
| Feedback | Aprovação financeira podia ser exibida antes da emissão da licença. | Recibo separa `paymentStatus` e `fulfillmentStatus`; confirmação temática, atualização do inventário e destaque só após existir key válida. |
| Estorno | Histórico financeiro já estornado com resumo de compra ainda aprovado podia permitir recuperar ou autorizar a key. | Emissão, validação, ativação e recibo conferem o histórico financeiro; regressão cobre a interrupção entre as gravações. |
| Mensal | Uma fatura antiga aprovada podia sustentar o vencimento desatualizado de um período posterior estornado. | Validação calcula a cobertura da última fatura ainda aprovada pelas condições aceitas; uma cobrança nova válida restaura o acesso. |
| Dependências | Auditoria passou a reportar seis avisos no Better Auth 1.6.23 e adaptadores. | API, cliente e adaptador MongoDB alinhados em 1.7.7, com locks atualizados e sessões novamente verificadas. |

As falhas de Magic Link, OAuth Proxy e PostgreSQL reportadas pela auditoria
dependem de módulos que esta aplicação não configura; a atualização remove os
avisos da árvore de dependências. A release informa que não exige migração de
banco: [notas oficiais do Better Auth 1.7.7](https://github.com/better-auth/better-auth/releases/tag/v1.7.7).
Também foi conferida a compatibilidade com as contas 1.6: o schema instalado
continua usando `providerId` e `accountId`, conforme a restauração documentada
na [release 1.7.3](https://github.com/better-auth/better-auth/releases/tag/v1.7.3).
Esta aplicação não passou pelas versões 1.7.0–1.7.2 nem utiliza os plugins que
exigem outras migrações de schema.

## Correções da beta.3 já presentes em `10f48a2`

| Área | Problema confirmado | Correção |
| --- | --- | --- |
| Privacidade | Uma consulta IPinfo iniciada antes da exclusão ou desativação podia recriar o IP depois. | Gravação transacional, revalidação da política persistente e revisão interna por servidor para invalidar coletas anteriores à exclusão. Duas regressões controlam a resposta externa em andamento. |
| Cobrança | Um cancelamento mensal aguardando o provedor podia salvar estado antigo sobre um vitalício concedido durante a espera. | Cancelamento aplica-se somente ao contrato mensal correspondente, após obter a trava da conta e reler o acesso atual. Endpoint e webhook usam o mesmo fluxo. |
| Compatibilidade | Checkout legado ainda pagável não participava do novo índice de reserva e podia coexistir com outra contratação. | A validação dentro da transação também bloqueia a contratação legada pendente com referência real no provedor. |
| Plugin | Expiração ou remoção do recurso de vendas públicas bloqueava recuperação de pagamentos/devoluções de transações existentes. | Recuperações administrativas e pagamentos duráveis continuam disponíveis; novas operações seguem protegidas. Testes incluem o locale turco. |
| Retorno de compra | Reabrir um retorno aprovado podia descontar itens adicionados ao carrinho depois da compra original. | Recibos locais limitados impedem repetir a limpeza do mesmo pedido; a autorização financeira continua no backend. |
| Consulta de compra | Cleanup de um efeito cancelava a consulta e a referência marcada impedia retomá-la em Strict Mode ou atualização da sessão. | Cancelamento e conclusão são estados distintos; consultas incompletas podem reiniciar, e respostas antigas são descartadas por conta. |
| Catálogo | Plano oculto salvo no carrinho não era renderizado e não podia ser removido. | Card de plano indisponível mantém a ação de remoção; checkout fica bloqueado até corrigir a seleção. |
| Preço exibido | A interface anunciava cobrança por mês mesmo quando o painel configurava outro intervalo. | Recorrência usa duração e unidade reais; testes cobrem dias, múltiplos meses e dados inválidos. |
| Configuração | O exemplo de ambiente não apresentava o token opcional de geolocalização nem explicava que o flag Trial virou seed. | `.env.example` documenta as duas condições sem incluir credenciais. |

As proteções de autenticação, autorização por recurso, schemas, índices,
retenção, migração de Trial e condições legadas foram conferidas. Os testes
atuais incluem as regressões dessas correções anteriores.

## Evidências de validação

| Verificação | Resultado |
| --- | --- |
| API: domínio e integração com MongoDB 7 descartável em replica set | 93 testes aprovados |
| API: compilação TypeScript | Aprovada |
| Website: capacidade, recorrência, recibos e acompanhamento de compra | 15 testes aprovados |
| Website: lint e TypeScript | Aprovados |
| Website: build de produção isolado | Aprovado; oito páginas e `/panel` com conteúdo dinâmico protegido |
| Navegador com API, sessões e banco de testes reais | Trial → checkout em janela própria → Pix sem webhook → key/card Ender Dragon independente; retorno sem URL, recibo único, 320/390 px e movimento reduzido |
| SpawnerX: Gradle offline `check exportPlugin` | Evidência da revisão anterior: 19 testes e 15 JARs verificados em `4d8c271`; submódulo limpo, sem mudanças nesta entrega |
| Auditoria API | Nenhuma vulnerabilidade reportada em 118 pacotes |
| Auditoria website | Nenhuma vulnerabilidade reportada em 187 pacotes |
| Assinaturas comuns de segredos em textos alterados | Nenhuma ocorrência; valores não foram impressos |
| Whitespace e submódulo | `git diff --check` aprovado |

A auditoria de pacotes usa a base consultada nesta data. A revisão e os testes
representam evidência sobre os cenários executados, sem prometer ausência de bugs.

## Migração e limites comprovados

A migração foi executada somente no banco local descartável, incluindo o índice
`one_paid_key_per_account_plan`: a API normaliza Trials legados, associa keys
pagas sem plano quando há vínculo real e cria a unicidade por conta/plano antes
de remover a unicidade antiga por conta. Execução repetida preserva as keys e os
servidores. A base de produção e os contratos Mercado Pago reais não foram
alterados. A inicialização também preserva os snapshots comerciais e os seeds
existentes. Não há nova coleção nem migração destrutiva dos documentos.

Gameplay em PaperMC, callbacks OAuth públicos e pagamentos/cancelamentos reais
Mercado Pago ainda precisam de validação no ambiente apropriado. Erros ambíguos
na criação de checkout conservam reservas até reconciliação no provedor;
liberação por tempo decorrido isoladamente permitiria reutilização indevida.
Identidade Microsoft não recebe `VERIFIED` somente por UUID, skin ou online-mode.
Geolocalização opcional depende de `IPINFO_TOKEN`. Permanecem avisos de APIs
Paper depreciadas e native access do SQLite; não houve falha de build.

Os serviços e dados de verificação são temporários. A cópia isolada do website
preserva `.next` e os serviços de desenvolvimento do usuário.
Veja [arquivos e entrega beta.3](ENTREGA_BETA3.md) e o
[guia de implantação e validação externa](LICENCIAMENTO_BETA3.md). O fluxo atual
e seus arquivos estão em [compra e keys independentes](COMPRA_LICENCAS_INDEPENDENTES.md).
