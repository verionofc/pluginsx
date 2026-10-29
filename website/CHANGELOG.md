# Website

## 0.5.1 — 2026-10-28

- Remove the floating global footer from the SpawnerX remote console so its editor and action rail are never covered.
- Keep the site shell and remote workspace visually separated on connection and management routes.

## 0.5.0 — 2026-10-28

- Bancada remota do SpawnerX em `/server/[serverId]/spawnerx`, com acesso verificado no servidor e por recurso na API.
- Conexão iniciada no Minecraft, autorização autenticada no website e confirmação privada no jogo; códigos temporários trocados sem armazenamento no navegador.
- Formulários visuais de `config.yml` e inventário da loja construídos pelo schema da instalação, com padrões, validação, prévia e editor YAML avançado.
- Rascunhos, aplicação, sincronização, reload, revisões, comparação e restauração integrados ao canal autenticado do plugin.
- Bloqueio de alterações quando a conexão operacional expira; resultados de operações dependem da confirmação real do SpawnerX.
- `/account` apresenta a disponibilidade do gerenciamento remoto e os plugins informados pela instalação.

## 0.5.2 — 2026-10-29

- Corrigido o estado terminal exibido após uma autorização válida quando a API ou o servidor ainda está respondendo.
- Adicionado fallback entre a origem direta da API e o rewrite seguro do mesmo domínio.
- A bancada agora oferece nova tentativa sem perder a sessão nem bloquear permanentemente o painel.
## 0.5.3 — 2026-10-29

- Catálogo visual de Mob Heads flat integrado ao painel de spawners.
- Cabeças carregadas por um componente reutilizável, com fallback pixelado, nomes amigáveis e IDs Minecraft preservados.
- Imagens restritas ao domínio `mc-heads.net`, sem chamadas arbitrárias ou alteração dos documentos YAML.
