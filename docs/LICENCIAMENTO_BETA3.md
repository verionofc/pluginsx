# Licenciamento 1.0.0-beta.3

Esta versão amplia os modelos e fluxos existentes de Better Auth, licenças,
Mercado Pago e servidores autorizados. O backend decide a validade da licença,
a capacidade disponível e a aprovação de cada instalação.

## Planos, preços e upgrades

`LicensingConfiguration` contém o catálogo e as políticas vigentes.
`LicensingRevision` registra autor, motivo, valores anteriores/novos e versão.
`api/plans.json` é o seed inicial, preservando as ofertas existentes. Após a
criação da configuração persistente, mudanças comerciais são feitas nas abas
Planos e Licenciamento do painel.

O catálogo mantém os identificadores `free`, `monthly`, `lifetime` e `aether`.
Nomes e descrições públicas são editáveis. Preços base/promocional usam centavos
inteiros, promoções podem ter início e fim e a API calcula seu valor efetivo.
A promoção só aparece quando a redução está vigente e corresponde ao checkout.
Vagas extras têm preço e quantidade máxima próprios.

Cada nova contratação registra `planTerms`: revisão, nome, preço, duração,
limite, recursos e permissões aceitos. Alterar uma oferta aplica-se a novas
contratações. Assinaturas anteriores mantêm suas condições no Mercado Pago;
a estratégia `new_contracts_only` cria contratos individuais com o valor da
revisão aceita, sem alegar sincronização retroativa. O painel mostra os
resultados persistidos de entrega ao provedor.

Uma conta pode ter Trial e um plano pago. Mensal e vitalício são acessos pagos
mutuamente exclusivos. O upgrade preserva o histórico e cancela a renovação
mensal antes de conceder o acesso permanente. Cada plano possui uma key própria:
a key mensal anterior fica inativa, e a key vitalícia tem seu próprio card e
vinculações. O Trial continua independente. Se o cancelamento falhar, o
pagamento fica registrado e o processamento pode ser retomado pelo webhook,
sem conceder dois planos pagos.

Durante o primeiro mês calendário, o crédito de upgrade usa a primeira cobrança
mensal efetivamente aprovada e vinculada à assinatura atual. Pagamentos com
cupom geram crédito pelo valor pago. O crédito é limitado ao valor do plano de
destino, tem reserva única e depende de evidência no livro financeiro. Exemplo:
um destino de R$ 59,90 com mensalidade aprovada de R$ 11,90 resulta em
R$ 48,00, antes de vagas extras ou outros descontos elegíveis. Não se presume
pagamento a partir de uma concessão administrativa ou de histórico incompleto.
Reembolso/contestação do pagamento usado como crédito revoga o upgrade
financeiramente dependente, preservando concessões administrativas independentes.

Uma reserva de contratação por conta evita checkouts pagos incompatíveis
simultâneos. Falhas ambíguas no provedor conservam a reserva: o checkout pode
ter sido criado e continuar pagável. A reconciliação de links abandonados ainda
exige verificar o estado no Mercado Pago antes de alterar reservas ou contadores.

## Migração e implantação

A migração é aditiva e executada pela inicialização normal de `api/src/server.ts`,
antes de aceitar conexões:

1. Inicializa os índices dos modelos, incluindo unicidade de instalação,
   solicitação, nonce, crédito e contratação pendente.
2. Cria a configuração persistente somente se ela ainda não existir.
   `TEMP_LICENSE_TRIAL_ENABLED` controla a disponibilidade inicial do Trial;
   as revisões seguintes são controladas pelo banco/painel.
3. Preenche `planTerms` ausentes de licenças e acessos existentes com as
   condições comerciais anteriores, sem substituir snapshots já presentes.
4. Preenche a titularidade de servidores legados a partir do proprietário real
   da licença ou da associação de Trial em `PlanAccess`. Registros órfãos não
   recebem um titular inferido de IP, nome ou UUID.
5. Importa para o livro financeiro o último pagamento ainda disponível em
   compras legadas, sem inventar mensalidades históricas ausentes.

A migração grava marcadores de execução e pode ser retomada. Ela não recria
usuários, substitui autenticação, exclui licenças válidas ou modifica os
contratos remotos do Mercado Pago. Reduzir a oferta comercial preserva o limite
aceito anteriormente. Uma redução explícita por conta bloqueia novas
aprovações acima da capacidade, sem remover automaticamente servidores.

Os testes executam a migração em MongoDB descartável. A implementação local
não executa a migração em uma base de produção; isso ocorre quando a API
atualizada é iniciada nesse ambiente. Transações exigem MongoDB Atlas ou
replica set. Faça backup do banco e da identidade local do plugin antes de
atualizar o ambiente real.

## Protocolo da instalação

`/sx license key <KEY>` valida permissão e formato no plugin, captura o
configurador e envia um pedido assinado por HTTPS fora da thread principal.
O plugin persiste `server-id` no config e a identidade Ed25519 em
`plugins/SpawnerX/license-identity.json`, com escrita atômica e permissões
restritas quando suportadas. Esse arquivo também contém a credencial de
ativação e deve acompanhar o backup da instalação. Não copie sua identidade
para um segundo servidor.

O envelope contém `payload` JSON serializado, `publicKey`, timestamp em
milissegundos, nonce UUID e assinatura Base64. A mensagem assinada é UTF-8:

```text
POST\n<pathname>\n<timestamp>\n<nonce>\n<SHA-256 hex do payload exato>
```

A API verifica Ed25519, janela do relógio e unicidade do nonce. O `requestId`
é a chave idempotente; retries usam o mesmo pedido com nonce novo. Recibos
mínimos impedem reutilizar pedidos após expiração do histórico. Autorizações
são vinculadas à conta, licença, servidor persistente e chave da instalação.
O backend nunca aceita validade ou titularidade declaradas pelo plugin.

As rotas usam o prefixo existente `/license/servers`:

| Rota | Autorização e efeito |
| --- | --- |
| `POST /activation-requests` | Prova assinada; cria ou recupera solicitação. |
| `POST /poll` | Prova da instalação; consulta aprovação e entrega credencial. |
| `POST /heartbeat` | Prova assinada e Bearer; verifica licença e comunicação. |
| `POST /privacy` | Prova da instalação; exclui dados opcionais do configurador. |
| `GET /` | Sessão do titular; lista inventário e servidores. |
| `GET /{id}` | Sessão e propriedade; detalhes/histórico. |
| `POST /{id}/approve` | Titular, origem web permitida e confirmação. |
| `POST /{id}/reject` | Titular, origem web permitida e confirmação. |
| `POST /{id}/remove` | Titular, origem e confirmação; revoga a vinculação. |
| `DELETE /{id}/privacy` | Titular, origem e confirmação; exclui dados opcionais. |

O prazo inicial de aprovação é de 12 minutos, configurável. A expiração é
verificada no processamento, independentemente da limpeza TTL. Solicitações
pendentes também reservam capacidade e aprovação simultânea é protegida por
transações. Remoção mantém o histórico e respeita a política de reativação.

O hash da credencial fica no banco. O plugin envia heartbeats autenticados e
recebe os intervalos, recursos e limites de tolerância do backend. Uma licença
ativa sem heartbeat recente não é apresentada como servidor online. A
tolerância a falhas usa apenas uma autorização previamente confirmada na
memória do processo e nunca ultrapassa o vencimento conhecido; reiniciar sem
contato com a API não concede um primeiro acesso premium.

A política de compatibilidade mantém clientes legados por padrão. O fluxo antigo
recusa registros de instalações beta.3; desabilitar novas ativações legadas
preserva os vínculos antigos já autorizados/pendentes. As reservas dos dois
protocolos são transacionais e compartilham a mesma capacidade. Revise a política no painel após
atualizar os servidores; a migração não presume que todos os clientes antigos
já suportam o protocolo assinado.

Se `license-identity.json` estiver corrompido ou perdido, a instalação não troca
silenciosamente de identidade. Restaure o backup correspondente; se ele não
existir, o titular deve revogar/remover a vinculação antiga e seguir a política
de reativação com uma identidade nova. Nunca divulgue a key ou o arquivo de
identidade em logs, tickets ou capturas de tela.

## Identidade e privacidade

São registrados nome/UUID públicos do jogador, tipo de execução, identificador
da instalação, versões Minecraft/Paper/plugin, datas UTC e modo de autenticação.
A referência da licença em eventos é derivada por hash. `onlineMode`,
`authenticationMode` e `accountVerification` são campos separados.

O relatório assinado comprova a instalação que o enviou; não comprova que o
jogador controla uma conta Microsoft. Jogadores ficam `UNVERIFIED`, console
recebe `NOT_APPLICABLE` e registros sem evidência ficam `UNKNOWN`. O estado
`VERIFIED` é reservado para um fluxo confiável futuro. A versão não classifica
ninguém como conta original ou pirata por UUID, skin ou `online-mode=false`.

Em Velocity/BungeeCord/Floodgate, configure explicitamente o modo de
autenticação e só marque encaminhamento confiável se o proxy estiver protegido.
O plugin não usa cabeçalhos arbitrários da requisição para validar identidade.
Sem encaminhamento confiável, não há coleta opcional do IP encaminhado.

IP/geolocalização exigem todas as condições:

- Coleta habilitada na política do backend e no `config.yml` do servidor.
- Consentimento informado por `/sx license privacy accept`, registrado na versão
  vigente; `/sx license privacy deny` retira a permissão e solicita a exclusão.
- Contexto direto online ou encaminhamento de proxy configurado como confiável.
- Para localização, geolocalização habilitada e `IPINFO_TOKEN` no ambiente privado
  da API. O IP é enviado ao IPinfo somente para essa finalidade opcional.

O IP é criptografado com AES-256-GCM, usando chave derivada de
`BETTER_AUTH_SECRET`; trocar esse segredo impede recuperar dados criptografados
anteriores. A interface privada mostra máscara e região/cidade aproximadas,
quando disponíveis. Falha ou ausência de consentimento não impede licenciamento.
Não se coletam GPS, endereço residencial, informações do dispositivo, sessão
Microsoft, credenciais ou dados privados do sistema operacional.

Dados opcionais têm retenção inicial de sete dias; eventos exibidos, 90 dias.
O painel permite ajustar os prazos dentro de limites seguros. Consultas filtram
expiração mesmo antes da limpeza TTL. Desativar a coleta remove os dados
sensíveis existentes; reduzir retenção antecipa o vencimento dos registros.
Recibos anti-replay mantêm somente referências mínimas, sem ator nem IP.

Avatar e skin são imagens públicas, obtidas por proxy Crafatar com UUID validado,
cache, limite de tamanho, timeout e fallback local. O link NameMC usa UUID
validado. O envio de um UUID público a esses serviços não verifica titularidade.

## Interfaces e operações

`/account` reúne Trial e acesso pago com aparência própria e servidores
personalizáveis. O modal usa abas Visão geral, Administrador, Licença e
Histórico. Autorização e conexão são estados distintos. Datas são armazenadas
em UTC e formatadas no fuso local do navegador. Remoção/revogação exige
confirmação e respeita a propriedade do recurso.

`/panel` valida a sessão/role no servidor; cada endpoint administrativo também
exige a role `owner`. Alterações comerciais e de política usam versão esperada,
motivo e confirmação, recusando gravações de uma revisão desatualizada. A
configuração inclui duração de aprovação, capacidade pendente, reativação,
heartbeat, timeout, retries, tolerância, limites de requisição, retenção,
recursos, permissões e preços.

Não é necessário cadastrar novos planos remotos compartilhados no Mercado Pago:
a integração atual cria cada assinatura com a revisão contratada. Mantenha os
mesmos tópicos de webhook e segredos existentes. O retorno do navegador nunca
concede um plano; o backend confirma a cobrança no provedor e aplica a concessão.

## Verificação e validação externa

Comandos locais, a partir da raiz:

```bash
(cd api && bun run typecheck && bun test --timeout 60000 src && bun run build)
(cd website && bun run lint && bunx tsc --noEmit && bun test lib && bun run build)
(cd plugins/SpawnerX && ./gradlew check exportPlugin)
```

Os testes de integração usam `COUPON_TEST_MONGODB_URI` com um MongoDB local
**descartável**, em replica set, cujo banco precisa ser `pluginsx_coupon_test`.
As fixtures limpam seus dados entre cenários. Sem essa variável, a integração
é omitida; sucesso dos testes de domínio não representa teste de MongoDB.
Nos testes automatizados, as chamadas ao SDK de pagamento são substituídas
somente dentro das fixtures. Produção mantém a integração real.

Para aceitar a beta em servidor PaperMC real:

1. Instale o JAR correspondente ao alvo Minecraft/Java e confirme a versão
   `1.0.0-beta.3` no console e no descritor.
2. Configure uma licença de teste válida como jogador autorizado. Confirme no
   site nome/UUID, versões, estado pendente e aprovação. Repita pelo console.
3. Aprove e confirme recursos, heartbeat e status recente; revogue no site e
   verifique o bloqueio. Deixe outro pedido expirar e verifique a mensagem.
4. Teste limite cheio e solicitações simultâneas em instalações independentes;
   remova uma vinculação e confira a reativação controlada.
5. Interrompa temporariamente a API e confira tolerância, retries, vencimento
   mensal e recuperação. Reinicie sem API para confirmar que não há nova
   concessão offline.
6. Em proxy protegido, valide o modo declarado e a ausência de falsa
   verificação Microsoft. Teste consentimento e recusa sem interromper ativação.
7. Em ambiente separado, use credenciais e contas Mercado Pago de teste para
   assinatura, promoção, upgrade, webhook repetido, estorno e cancelamento.
   Confira o valor no provedor e a preservação de uma assinatura anterior.
8. Faça o fluxo web em desktop/celular e teclado: abertura/fechamento do modal,
   abas, confirmação, estados de carregamento, erro, vazio e mídia indisponível.

Os testes/builds locais e roteiros do navegador não substituem execução em
PaperMC real, callbacks OAuth públicos ou liquidação/cancelamento no Mercado
Pago. Esses três fluxos externos precisam de validação no ambiente apropriado.
O plugin usa o host HTTPS PluginsX por padrão. Para staging, defina
`license.api-url` com uma origem HTTPS válida e reinicie o plugin. HTTP,
credenciais na URL, caminhos, query e fragmentos são recusados; TLS permanece
validado. Uma configuração inválida emite aviso e usa a origem padrão.
A exportação Gradle grava JARs e índices locais em `builds/`; ela não
publica uma release nem implanta a API ou o website.
