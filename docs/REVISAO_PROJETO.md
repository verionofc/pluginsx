# Revisão técnica do PluginsX

Data: 26/10/2026. Escopo: website Next.js, API Elysia/Mongoose, cobrança e cupons,
autenticação, licenças e servidores, SpawnerX e geração do catálogo PaperMC.

## Arquitetura e fluxo verificado

O usuário escolhe um plano ou vagas, aplica um cupom e inicia um checkout. O
backend calcula os valores pelo catálogo local, reserva o desconto e vincula a
compra ao provedor. Somente a confirmação consultada no Mercado Pago concede
acesso. A conta apresenta a licença, seu período pago, a próxima fatura e os
servidores autorizados. O painel proprietário administra acessos e cupons.

- O site encaminha autenticação e rotas privadas à API na mesma origem.
- Better Auth usa GitHub obrigatório e Discord opcional. As rotas do painel
  verificam a role `owner` no servidor; esconder a interface não concede acesso.
- `api/plans.json` define os preços e limites. Foi preservado o preço de R$ 129,90
  do Aether existente na árvore de trabalho.
- Preferências de tema ficam no navegador; identificação de servidores fica no
  MongoDB e exige propriedade do registro. O plugin não recebe essa identificação
  privada pelos endpoints públicos.
- Gradle compila e valida 15 alvos PaperMC; `exportPlugin` atualiza os artefatos
  publicados. `check` agora verifica sem exportar para `builds/`.

## Problemas corrigidos durante a revisão

| Problema | Correção |
| --- | --- |
| Um desconto elevado em vários itens podia gerar R$ 0,02 no provedor para um orçamento de R$ 0,01. | Rateio em centavos com distribuição exata dos restos; itens integralmente descontados são omitidos do checkout. |
| Reserva ou confirmação de cupom podia atualizar apenas parte dos contadores em caso de falha. | Transações MongoDB para reserva e liquidação, com índice único por referência da compra e testes de concorrência. |
| O limite por conta participava de um upsert, provocando tentativa de inserir outra linha ao atingir o limite. | Inicialização independente da linha e atualização condicional dentro da transação. |
| Pagamentos cancelados, pausas ou falhas ambíguas podiam liberar uma reserva ainda utilizável. | Reservas são preservadas quando há possibilidade de pagamento posterior; somente uma criação definitivamente recusada libera automaticamente o cupom. |
| A autorização da assinatura podia substituir um período mensal pago por `pending`. | Sincronização transacional preserva períodos pagos, concessões do proprietário, revogações e planos permanentes. |
| Uma notificação interrompida podia ficar eternamente marcada como duplicada. | Somente eventos concluídos recebem confirmação de duplicata; eventos em andamento pedem nova tentativa e reservas de processamento antigas podem ser retomadas após cinco minutos. |
| O recurso do corpo do webhook podia divergir do recurso assinado na URL. | Divergências são rejeitadas antes do processamento. |
| Ações de autorização de servidor não conferiam a origem web. | Validação da origem e nova conferência da validade da licença antes de aprovar. |
| Gradle tentava chamar `get()` em um `RegularFile`, impedindo a compilação do script. | Acesso correto por `asFile`; compilação e testes executados novamente. |
| `check` exportava os JARs e reescrevia o catálogo publicado. | Separação entre verificação e exportação explícita. |
| Lint do site falhava por formatação, importações, regiões de status e chaves de lista. | Ajustes semânticos e formatação; preservada a navegação por teclado das abas. |
| A auditoria da API apontou 15 vulnerabilidades em três dependências. | Axios 1.20.0, follow-redirects 1.16.1 e Zod 4.6.6, com lockfile atualizado e nova auditoria sem alertas. |
| Instruções locais citavam Discord obrigatório e callbacks na porta da API. | READMEs alinhados às variáveis, rotas e recursos atuais. |

## Evidências de validação

- API: compilação TypeScript e 32 testes aprovados, incluindo oito testes de
  integração com um MongoDB 7 temporário em replica set. Concorrência de limites
  globais e por conta, rollback, duplicatas, retentativas e preservação de acesso
  foram exercitados sem usar os dados da aplicação.
- Website: lint completo, TypeScript, build de produção e cinco testes de
  capacidade aprovados. O build foi executado em uma cópia isolada para preservar
  o servidor de desenvolvimento em uso.
- SpawnerX: `./gradlew check --rerun-tasks` aprovado, com sete testes Java e
  validação dos artefatos dos 15 alvos configurados.
- Dependências: `bun audit` sem vulnerabilidades reportadas na API (118 pacotes)
  e no website (187 pacotes), segundo a base consultada na data da revisão.
- HTTP real local: catálogo público respondeu 200; estado financeiro, painel,
  cupons, inventário, licença privada e perfil sem sessão responderam 401.
  Webhook sem assinatura também respondeu 401.
- Navegador Chromium com respostas simuladas: expiração mensal com data, hora,
  fuso e segundos; fatura independente; bloqueio da key ao vencer e recuperação
  após renovação; vagas individuais, capacidade ilimitada e limite de um milhão;
  ausência de transbordamento nas larguras 1440, 768, 390 e 320 px.
- Navegador com proprietário simulado: abas e teclado, seleção dos quatro produtos
  pagos, criação e desativação de cupom, limites por conta e término obrigatório.
- Carrinho no navegador: orçamento e invalidação ao mudar a quantidade; temas
  Padrão, The End e Aether, preferência de movimento e persistência após reload.
- Identificação de servidores no navegador: edição, tags sem duplicatas, ícone,
  fixação, ordenação, recarga, atualizações parciais, erros da API e validação
  local, incluindo o diálogo em 390 e 320 px.

## Limites e próximos cuidados

1. OAuth real, pagamento, renovação, cancelamento e reembolso reais no Mercado
   Pago não foram executados. Falta validar esses fluxos em sandbox com as
   credenciais próprias de teste e webhooks entregues pelo provedor.
2. Reservas de cupons abandonadas ou de assinaturas canceladas sem cobrança
   finalizada permanecem reservadas. Ainda falta uma rotina de reconciliação que
   confirme o encerramento no provedor e a ausência de pagamentos em trânsito
   antes de liberar o limite. Liberar por tempo decorrido isoladamente permitiria
   reutilizar um desconto que ainda pode ser pago.
3. As transações de cupons e de sincronização da assinatura exigem replica set;
   MongoDB Atlas atende esse requisito. Os testes de integração são opcionais no
   comando normal e exigem `COUPON_TEST_MONGODB_URI` apontando para um banco local
   descartável chamado `pluginsx_coupon_test`, conforme `api/README.md`.
4. A validação Java cobre compilação, metadados, XP e persistência SQLite em testes.
   Não substitui iniciar um servidor PaperMC e exercitar os menus e os eventos
   com jogadores em cada versão.
5. A auditoria de pacotes e esta revisão não garantem ausência de vulnerabilidades;
   representam o código e as evidências disponíveis nesta data.

As verificações locais não publicaram deployment nem enviaram commits ao remoto.
