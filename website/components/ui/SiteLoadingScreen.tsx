import { TbBlocks, TbPick } from "react-icons/tb";

import { SiteBackground } from "@/components/ui/SiteBackground";

type SiteLoadingScreenProps = {
  detail: string;
  stage: string;
};

const loadingCells = [
  { id: "northwest", color: "bg-surface-raised" },
  { id: "north", color: "bg-surface-raised" },
  { id: "northeast", color: "bg-surface-raised" },
  { id: "west", color: "bg-accent-strong" },
  { id: "center", color: "bg-accent" },
  { id: "east", color: "bg-accent-strong" },
  { id: "southwest", color: "bg-[#5d4935]" },
  { id: "south", color: "bg-[#765438]" },
  { id: "southeast", color: "bg-surface-raised" },
];

export function SiteLoadingScreen({ detail, stage }: SiteLoadingScreenProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: This live region contains a complete loading screen, not a form output.
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] isolate grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 py-8 text-foreground"
    >
      <SiteBackground />
      <section className="relative w-full max-w-md border-2 border-outline/45 bg-surface p-1 shadow-[0_10px_0_var(--site-shadow),0_35px_100px_rgba(0,0,0,0.6)]">
        <div className="border border-white/[0.04] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--site-accent)_7.5%,transparent),transparent_44%),var(--site-surface-deep)] px-5 py-6 sm:px-8 sm:py-8">
          <header className="flex items-center justify-between gap-3 border-b border-outline/25 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center border-2 border-outline-strong/50 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_3px_var(--site-surface)]">
                <TbBlocks className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-minecraft-text text-sm font-black tracking-wide text-white">
                  PluginsX
                </p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
                  Inicialização do mundo
                </p>
              </div>
            </div>
            <span className="shrink-0 border border-outline/25 px-2 py-1 font-mono text-[9px] font-semibold text-muted">
              PX · 01
            </span>
          </header>

          <div className="flex items-center gap-5 py-6 sm:gap-6 sm:py-8">
            <div className="relative grid size-[5.25rem] shrink-0 grid-cols-3 gap-[3px] border-2 border-outline/45 bg-canvas p-1.5 shadow-[5px_6px_0_var(--site-shadow)] sm:size-24">
              {loadingCells.map(({ id, color }, index) => (
                <span
                  key={id}
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 90}ms` }}
                  className={`chunk-loading-block ${color} border border-black/15`}
                />
              ))}
              <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center border-2 border-surface bg-accent text-on-accent shadow-[2px_3px_0_var(--site-shadow)]">
                <TbPick className="size-4" aria-hidden="true" />
              </span>
            </div>

            <div className="min-w-0">
              <p className="font-minecraft-text text-[1.65rem] font-black leading-none tracking-tight text-white sm:text-3xl">
                Loading<span className="text-accent">...</span>
              </p>
              <p className="mt-3 text-xs leading-5 text-muted sm:text-sm">
                {detail}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.17em] text-muted">
            <span>Sincronizando dados</span>
            <span className="flex items-center gap-1.5 text-accent-soft">
              <span className="size-1.5 animate-pulse bg-accent motion-reduce:animate-none" />
              Aguarde
            </span>
          </div>
          <div
            aria-hidden="true"
            className="chunk-loading-rail relative mt-2 h-2 overflow-hidden border border-outline/25 bg-canvas p-[2px]"
          >
            <div className="chunk-loading-scan h-full w-1/3 bg-[repeating-linear-gradient(90deg,var(--site-accent-strong)_0_12px,var(--site-accent)_12px_16px,var(--site-accent-edge)_16px_20px)] shadow-[0_0_12px_color-mix(in_srgb,var(--site-accent)_45%,transparent)]" />
          </div>
          <p className="mt-3 font-mono text-[9px] text-subtle">{stage}</p>
        </div>
      </section>
    </div>
  );
}
