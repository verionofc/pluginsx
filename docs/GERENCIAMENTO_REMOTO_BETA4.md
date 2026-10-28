# Gerenciamento remoto — Website 0.5.0 e SpawnerX beta.4

O gerenciamento usa a conta, a key paga e a identidade de instalação existentes.
A key Trial continua independente e não concede administração remota. O plugin
não abre uma porta de administração no servidor Minecraft: ele inicia as
requisições HTTPS assinadas para a API.

## Conectar uma instalação

1. Atualize o website, a API e o SpawnerX para as versões desta entrega. Preserve
   `license-identity.json`, a configuração e os arquivos de dados existentes.
2. Autorize normalmente a instalação da licença paga em `/account`.
3. No jogo, um administrador com `spawnerx.connect` executa `/sx connect`.
4. Abra o link privado recebido, entre na conta titular e confira a instalação.
5. Autorize no website e confirme no Minecraft com o mesmo jogador solicitante.
6. O painel abre em `/server/{id-do-registro}/spawnerx` depois que o plugin
   confirma a sessão. Abrir o link ou aprovar somente no website não basta.

O link expira em cinco minutos. Seu token tem alta entropia, aparece no fragmento
removido pelo frontend e é persistido apenas como hash na API. O código curto
serve para conferência visual. Sessão da conta e confirmação no jogo continuam
obrigatórias. Nome/UUID reportados pelo servidor não são prova de autenticação
Microsoft; o painel preserva essa distinção.

## Configuração e aplicação

O plugin informa a versão, as capacidades, os valores e os padrões realmente
suportados. O editor visual organiza esses dados por seção; o modo YAML opera
sobre o mesmo documento permitido. A configuração de licença, a origem da API,
credenciais, identidade privada e consentimentos locais não são exportados.

O editor da loja representa as categorias e os itens do `shop.yml` instalado.
Nesta versão, a moeda implementada é XP. Não há configuração fictícia de moeda,
preço de venda ou requisito que o plugin não reconheça.

Salvar um rascunho registra uma revisão no website. Aplicar envia uma operação
específica ao plugin, que verifica o hash dos arquivos, cria o backup e devolve
seu resultado. O painel distingue rascunho, envio, aplicação, reload necessário,
reinicialização necessária e falha. Uma resposta de aceitação da API não é uma
confirmação de gravação no Minecraft.

Alterações locais após a sincronização causam conflito. Sincronize novamente e
revise o documento antes de enviar outra operação. Restaurar uma revisão passa
pelas mesmas validações e confirmações de uma alteração comum. Reload remoto
usa a rotina oficial do SpawnerX; o protocolo não executa comandos arbitrários.

## Conexão e desconexão

Heartbeats operacionais assinados atualizam uma janela curta de disponibilidade.
Apenas manter uma conexão de rede ou ter uma licença ativa não torna o servidor
online. O painel bloqueia salvar, aplicar, restaurar e recarregar quando a janela
expira; revisões e histórico continuam disponíveis para consulta.

Operações sem entrega expiram após perda de conexão. Uma operação já entregue
sem resultado confirmado permanece com resultado desconhecido, sem alegar que
foi aplicada e sem ser executada outra vez automaticamente. O plugin mantém
um diário de operações para evitar duplicação quando uma resposta se perde.

Revogação da licença, remoção da autorização ou encerramento da sessão bloqueiam
as próximas fronteiras autenticadas. Depois de uma interrupção, o canal exige
nova validação de disponibilidade e autorização; códigos de conexão antigos não
são credenciais duráveis. O protocolo detalhado está em
[REMOTE_PROTOCOL_BETA4.md](REMOTE_PROTOCOL_BETA4.md).

## Implantação e validação

Os novos documentos de sessão, revisão e operação são adicionais ao banco.
A inicialização da API cria seus índices sem substituir licenças, pagamentos,
assinaturas ou vinculações. API, website e plugin devem ser implantados como
um conjunto compatível. Instalações antigas continuam usando o licenciamento
existente; administração remota depende das capacidades da beta.4.

As evidências e os comandos de teste serão registrados ao concluir a validação
desta entrega. Nenhum teste deve usar dados, keys ou cobranças de produção.
