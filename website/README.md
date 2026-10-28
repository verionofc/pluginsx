# PluginsX Website

Site do projeto PluginsX feito com Next.js App Router, React e Tailwind CSS.

## Desenvolvimento

Instale as dependências com Bun e inicie o servidor local:

```bash
bun install
bun run dev
```

Abra [http://localhost:3000](http://localhost:3000). Os principais arquivos da aplicação ficam em `app/`, os componentes reutilizáveis em `components/`, e os estilos globais em `styles/`.

Configure `NEXT_PUBLIC_API_URL` com a URL pública da API PluginsX. As páginas disponíveis são `/`, `/plans`, `/cart`, `/account` e `/panel`. O catálogo de planos vem da API; preços e elegibilidade de cupons são recalculados pelo backend no checkout.

A página `/account` permite entrar com GitHub ou Discord, consultar a sessão e sair da conta. O inventário da conta diferencia cada plano, mostra a expiração mensal com data, hora e contagem em segundos, além da próxima fatura confirmada pelo provedor. Servidores autorizados podem receber nome, tags, ícone e fixação; essas preferências são salvas na API. Limites pequenos usam vagas individuais, limites grandes usam uma barra e acessos ilimitados têm uma apresentação própria. As chamadas de autenticação, sessão e licença passam por rewrites do Next.js no mesmo domínio do site; o catálogo continua usando `NEXT_PUBLIC_API_URL` diretamente.

Cadastre os callbacks OAuth na origem pública do site configurada em `URL` e `DEV_URL` na API. Em produção, use `https://pluginsx.vercel.app/auth/callback/github` e `https://pluginsx.vercel.app/auth/callback/discord`; localmente, use `http://localhost:3000/auth/callback/github` e `http://localhost:3000/auth/callback/discord`. A porta `3333` é da API e não deve ser usada como callback: o site encaminha `/auth/*` à API por rewrite.

## Verificações e build

```bash
bun run lint
bun test lib
bun run build
bun audit
```


A página `/plans` consulta o catálogo e o estado financeiro na API. O checkout,
o teste de licença temporária opcional e o cancelamento mensal são processados
no backend; uma URL de retorno do Mercado Pago não confirma o pagamento. Configure as credenciais do
Mercado Pago somente na API conforme `api/.env.example` e cadastre
`${URL}/billing/webhook` no painel do Mercado Pago.

A aparência oferece Padrão, The End e Aether, com variáveis semânticas de cor,
fundo Minecraft em CSS e controle de movimento. O loading reutiliza o mesmo
fundo. Preferências ficam no navegador e são aplicadas antes da primeira pintura.

O painel valida a sessão e a role `owner` no servidor e organiza visão geral,
cupons, contas, acessos, cobranças, planos, licenciamento e auditoria em abas.
Planos e políticas são persistidos na API, com motivo, confirmação e controle
de versão. O preview mostra o preço promocional efetivo; alterações não
modificam os contratos anteriormente aceitos no Mercado Pago.

Na beta.3, `/account` permite consultar administrador, versões, licença e
histórico por servidor em um modal de quatro abas, com avatar/skin e fallback.
O status online vem de heartbeat autenticado, separado da autorização da
licença. Identidade reportada pelo plugin aparece como não verificada;
UUID e skin não comprovam titularidade Microsoft. Dados opcionais, quando
consentidos, aparecem mascarados e podem ser excluídos.

Trial pode coexistir com um acesso pago. O carrinho consulta o crédito real de
upgrade mensal para vitalício no backend e envia o total esperado para recusar
orçamentos desatualizados. Preços, limites, recursos e disponibilidade vêm da
configuração persistente, sem exigir rebuild para alterações do painel.
Compras pendentes podem ser retomadas pela URL HTTPS persistida na API. Quando
o pagamento foi recebido e falta cancelar a renovação anterior, a interface
mostra a finalização do upgrade e permite consultar seu estado. O painel exibe
as falhas de criação/cancelamento registradas no provedor.

Os roteiros locais podem usar API e MongoDB descartáveis com sessões reais.
OAuth público, pagamentos no provedor e operação do plugin em PaperMC real
exigem validação externa. Consulte o
[guia beta.3](../docs/LICENCIAMENTO_BETA3.md) para migração, protocolo,
privacidade e cenários de aceite.

A confirmação da compra acompanha `paymentStatus` e `fulfillmentStatus` do
backend. O checkout pode abrir em uma janela própria mantendo o acompanhamento
no site; em bloqueio de popups, a referência fica salva antes do redirecionamento.
Ao retornar, inclusive sem parâmetros na URL, o pedido é recuperado por conta.
O recibo com a arte do plano e a animação de conquista aparece uma única vez
após a key estar pronta. O inventário atualiza e destaca o card correspondente,
respeitando movimento reduzido. Veja o [fluxo completo](../docs/COMPRA_LICENCAS_INDEPENDENTES.md).

## Gerenciamento remoto · v0.5.1

`/account` abre a bancada do SpawnerX em `/server/[serverId]/spawnerx`. O servidor
precisa executar uma versão compatível com o protocolo remoto, iniciar
`/sx connect` e concluir a autorização no website e no Minecraft. A rota é
verificada no servidor, e a API valida a titularidade e a licença em cada ação.

Os formulários e os padrões vêm das capacidades reais da instalação. O editor
avançado utiliza o parser `yaml` com validação de estrutura e rejeição de aliases;
somente propriedades públicas dos documentos são expostas. Um rascunho salvo no
website ainda não altera o jogo. Aplicação, reload e restauração só aparecem
como concluídos depois do resultado do plugin, e exigem uma sessão operacional.

O link de conexão transporta o token no fragmento, removido ao abrir a tela.
Tokens ficam apenas na memória da página; o login pode abrir em uma janela
separada. Não há credenciais internas de comunicação no frontend.

Veja o [protocolo beta.4](../docs/REMOTE_PROTOCOL_BETA4.md) para o contrato e os
estados de entrega, conexão, auditoria e recuperação.
