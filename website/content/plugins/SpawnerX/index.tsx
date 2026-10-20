import Link from "next/link";
import {
  TbArrowLeft,
  TbArrowsExchange,
  TbArrowUpRight,
  TbBolt,
  TbDatabase,
  TbEgg,
  TbLock,
  TbShoppingCart,
} from "react-icons/tb";

import { ReleaseSearch } from "@/content/plugins/ReleaseSearch";
import { getApiUrl, getPluginReleases } from "@/lib/plugins";

const plugins = {
  spawnerx: {
    name: "SpawnerX",
    summary: "Gerenciamento de spawners para servidores PaperMC.",
    description:
      "Controle como spawners são coletados, evoluídos e negociados. Configure raridades, requisitos de quebra e permissões para adaptar o funcionamento à economia do seu servidor Paper.",
    repository: "https://github.com/yeyTaken/SpawnerX",
    features: [
      {
        icon: TbEgg,
        title: "Controle de spawners",
        description:
          "Configure requisitos para quebra, coleta por explosões e interação informativa com Shift + clique direito.",
      },
      {
        icon: TbBolt,
        title: "Evolução por níveis",
        description:
          "Evolua em sequência usando os materiais configurados. Spawners empilhados não podem ser aprimorados.",
      },
      {
        icon: TbShoppingCart,
        title: "Loja e vendas por XP",
        description:
          "Abra a loja do servidor e publique anúncios para outros jogadores comprarem usando experiência.",
      },
      {
        icon: TbArrowsExchange,
        title: "Trocas entre jogadores",
        description:
          "Negocie spawners diretamente com outros jogadores por meio do sistema de troca do plugin.",
      },
      {
        icon: TbDatabase,
        title: "Persistência local",
        description:
          "Anúncios, pagamentos pendentes e histórico de vendas são mantidos em banco SQLite.",
      },
      {
        icon: TbLock,
        title: "Permissões configuráveis",
        description:
          "Separe ações administrativas, loja, vendas, trocas, quebra e evolução por permissões.",
      },
    ],
    commands: [
      ["/spawnerx", "Exibe a ajuda do plugin."],
      ["/spawnerx shop", "Abre a loja de spawners."],
      [
        "/spawnerx sell xp <valor> <quantidade>",
        "Anuncia spawners para venda por XP.",
      ],
      ["/spawnerx sell stats", "Consulta anúncios, pagamentos e histórico."],
      ["/spawnerx trade <jogador>", "Envia uma solicitação de troca."],
      [
        "/spawnerx give <jogador> <mob> [quantidade]",
        "Entrega spawners; requer permissão administrativa.",
      ],
      ["/spawnerx reload", "Recarrega as configurações do plugin."],
    ],
  },
} as const;

export async function SpawnerXPage() {
  const details = plugins.spawnerx;
  const apiUrl = getApiUrl();
  const releaseList = await getPluginReleases("spawnerx");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-foreground/65 transition-colors hover:text-foreground"
      >
        <TbArrowLeft size={17} aria-hidden /> Voltar ao início
      </Link>

      <section className="mt-8 rounded-3xl border border-foreground/10 bg-background/60 p-6 shadow-sm sm:p-10">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <span>Exclusivo para PaperMC</span>
          <span aria-hidden>·</span>
          {releaseList && <span>Versão atual {releaseList.latestVersion}</span>}
        </div>
        <div className="mt-5 flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              {details.name}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-foreground/70">
              {details.description}
            </p>
          </div>
          <Link
            href={details.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-foreground/15 px-5 py-3 font-semibold text-foreground transition-colors hover:bg-foreground/5"
          >
            Código-fonte <TbArrowUpRight size={18} aria-hidden />
          </Link>
        </div>
        <p className="mt-8 border-t border-foreground/10 pt-5 text-sm leading-relaxed text-foreground/65">
          Este plugin usa a Paper API e foi desenvolvido para servidores
          PaperMC. A API de downloads do PluginsX também atende exclusivamente
          PaperMC; não oferece arquivos para Spigot, Bukkit ou outras
          plataformas.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight">
          Escolha sua versão do Minecraft
        </h2>
        <p className="mt-2 text-sm text-foreground/65">
          A API seleciona o JAR do SpawnerX compatível com cada versão Paper.
        </p>
        {releaseList?.versions.length && apiUrl ? (
          <ReleaseSearch
            releases={releaseList.versions}
            apiUrl={apiUrl}
            pluginName={details.name}
          />
        ) : (
          <p className="mt-5 rounded-2xl border border-foreground/10 bg-background/45 p-5 text-sm text-foreground/65">
            Não foi possível carregar as versões. Tente novamente mais tarde.
          </p>
        )}
        <p className="mt-4 text-xs text-foreground/50">
          Os downloads são servidos pela API PluginsX, exclusiva para PaperMC.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight">O que ele oferece</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {details.features.map(({ icon: FeatureIcon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-foreground/10 bg-background/45 p-5"
            >
              <FeatureIcon size={22} className="text-primary" aria-hidden />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Comandos</h2>
          <div className="mt-5 divide-y divide-foreground/10 rounded-2xl border border-foreground/10 bg-background/45 px-5">
            {details.commands.map(([command, description]) => (
              <div
                key={command}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5"
              >
                <code className="text-sm font-semibold text-primary">
                  {command}
                </code>
                <p className="text-sm text-foreground/65 sm:max-w-xs sm:text-right">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-foreground/10 bg-background/45 p-6">
          <h2 className="text-xl font-bold">Instalação no PaperMC</h2>
          <ol className="mt-4 list-inside list-decimal space-y-3 text-sm leading-relaxed text-foreground/70">
            <li>Escolha a versão de Minecraft para baixar o JAR compatível.</li>
            <li>
              Coloque o arquivo na pasta <code>plugins/</code> do servidor
              Paper.
            </li>
            <li>Reinicie o servidor para gerar os arquivos de configuração.</li>
          </ol>
          <p className="mt-5 border-t border-foreground/10 pt-4 text-xs leading-relaxed text-foreground/55">
            O requisito de Java depende da versão selecionada e aparece em cada
            opção de download.
          </p>
        </aside>
      </section>
    </main>
  );
}
