# PluginsX Website

Site do projeto PluginsX feito com Next.js App Router, React e Tailwind CSS.

## Desenvolvimento

Instale as dependências com Bun e inicie o servidor local:

```bash
bun install
bun run dev
```

Abra [http://localhost:3000](http://localhost:3000). Os principais arquivos da aplicação ficam em `app/`, os componentes reutilizáveis em `components/` e `widgets/`, e os estilos globais em `styles/`.

Configure `NEXT_PUBLIC_API_URL` com a URL pública da API PluginsX. O site carrega o catálogo de plugins em `/plugins` e as versões pelo índice individual de cada plugin, com cache de uma hora. A rota `/plugins/{slug}` usa conteúdo detalhado do SpawnerX e uma página genérica de downloads para outros plugins PaperMC publicados no catálogo.

A página `/account` permite entrar com GitHub ou Discord, consultar a sessão e sair da conta. Na página inicial, a key Premium/Plus é gerada para a conta autenticada e pode ser recuperada depois sem criar uma segunda key. As chamadas de autenticação, sessão e licença passam por rewrites do Next.js no mesmo domínio do site; o catálogo continua usando `NEXT_PUBLIC_API_URL` diretamente.

Cadastre os callbacks OAuth na origem pública do site configurada em `URL` e `DEV_URL` na API. Em produção, use `https://pluginsx.vercel.app/auth/callback/github` e `https://pluginsx.vercel.app/auth/callback/discord`; localmente, use `http://localhost:3000/auth/callback/github` e `http://localhost:3000/auth/callback/discord`. A porta `3333` é da API e não deve ser usada como callback: o site encaminha `/auth/*` à API por rewrite.

## Verificações e build

```bash
bun run lint
bun run build
```


A página `/plans` consulta o catálogo e o estado financeiro na API. O checkout,
o teste de licença temporária opcional e o cancelamento mensal são processados
no backend; uma URL de retorno do Mercado Pago não confirma o pagamento. Configure as credenciais do
Mercado Pago somente na API conforme `api/.env.example` e cadastre
`${URL}/billing/webhook` no painel do Mercado Pago.
