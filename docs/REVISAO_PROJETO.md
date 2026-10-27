# Revisão técnica do PluginsX

Data: 27/10/2026. Escopo: website Next.js, API Elysia/Mongoose, Better Auth,
planos, pagamentos e cupons, ativação e privacidade, plugin SpawnerX,
configuração Gradle, artefatos PaperMC e documentação. Revisão sobre a beta.3
antes do commit solicitado pelo usuário.

## Arquitetura e regras conferidas

- Better Auth e MongoDB continuam responsáveis por sessão e titularidade.
  `/panel` valida a sessão no servidor e cada endpoint exige `owner`.
- O catálogo persistente é a autoridade comercial; `api/plans.json` fornece o
  seed inicial. Contratos guardam condições aceitas, preservando preços e limites.
- Trial pode coexistir com um plano pago. Mensal e vitalício compartilham um
  acesso pago; crédito de upgrade depende do pagamento real, da assinatura e
  da primeira janela mensal, com reserva única.
- O checkout calcula valores no backend. O retorno do navegador não concede
  acesso; o webhook consulta e valida o recurso no Mercado Pago.
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

## Problemas encontrados e corrigidos nesta revisão

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
retenção, migração de Trial e condições legadas foram revisadas. Nenhum outro
bloqueador confirmado foi identificado no escopo inspecionado.

## Evidências de validação

| Verificação | Resultado |
| --- | --- |
| API: domínio e integração com MongoDB 7 descartável em replica set | 83 testes aprovados |
| API: compilação TypeScript | Aprovada |
| Website: capacidade, recorrência e recibos | 10 testes aprovados |
| Website: lint e TypeScript | Aprovados |
| Website: build de produção isolado | Aprovado; oito páginas e `/panel` com conteúdo dinâmico protegido |
| Navegador com API, sessões e banco de testes reais | Aprovado; fluxo completo e regressões da revisão com API e MongoDB reais de teste |
| SpawnerX: Gradle offline `check exportPlugin` | 19 testes aprovados; 15 JARs verificados |
| Auditoria API | Nenhuma vulnerabilidade reportada em 118 pacotes |
| Auditoria website | Nenhuma vulnerabilidade reportada em 187 pacotes |
| Assinaturas comuns de segredos em textos alterados | Nenhuma ocorrência; valores não foram impressos |
| Whitespace e submódulo | `git diff --check` aprovado |

A auditoria de pacotes usa a base consultada nesta data. A revisão e os testes
representam evidência sobre os cenários executados, sem prometer ausência de bugs.

## Migração e limites comprovados

A migração aditiva foi executada somente no banco local descartável. A base de
produção e os contratos Mercado Pago reais não foram alterados. Na implantação,
a API inicializa índices, cria catálogo ausente, preserva snapshots e preenche
vínculos legados quando existe associação real de titularidade.

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
[guia de implantação e validação externa](LICENCIAMENTO_BETA3.md).
