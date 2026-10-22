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

A página `/account` permite entrar com GitHub, consultar a sessão e sair da conta. Na página inicial, a key Premium/Plus é gerada para a conta autenticada e pode ser recuperada depois sem criar uma segunda key. As chamadas de autenticação, sessão e licença passam por rewrites do Next.js no mesmo domínio do site; o catálogo continua usando `NEXT_PUBLIC_API_URL` diretamente.

Cadastre `${URL}/auth/callback/github` como callback OAuth do GitHub, usando a mesma origem pública do site definida em `URL` na API. Em produção, `https://pluginsx.vercel.app/auth/callback/github` é encaminhado pelo site à API em `https://api-pluginsx.vercel.app`.

## Verificações e build

```bash
bun run lint
bun run build
```
