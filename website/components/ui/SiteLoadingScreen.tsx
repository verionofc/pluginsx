import { TbBlocks, TbPick } from "react-icons/tb";

type SiteLoadingScreenProps = {
  detail: string;
  stage: string;
};

const chunkColors = [
  "bg-[#355331]",
  "bg-[#557b3f]",
  "bg-[#263f2b]",
  "bg-[#6d9150]",
  "bg-[#8ab45a]",
  "bg-[#476b38]",
  "bg-[#5d4935]",
  "bg-[#765438]",
  "bg-[#34462c]",
];

export function SiteLoadingScreen({ detail, stage }: SiteLoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] isolate grid min-h-dvh place-items-center overflow-hidden bg-[#070b08] px-4 py-8 text-[#eff5df]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(82,132,59,0.2),transparent_48%),linear-gradient(180deg,rgba(6,11,8,0.2),#070b08_88%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[linear-gradient(90deg,rgba(151,190,121,0.18)_1px,transparent_1px),linear-gradient(rgba(151,190,121,0.18)_1px,transparent_1px)] bg-size-[32px_32px]"
      />
      <section className="relative w-full max-w-md border-2 border-[#718667]/45 bg-[#101811] p-1 shadow-[0_10px_0_#030604,0_35px_100px_rgba(0,0,0,0.6)]">
        <div className="border border-white/[0.04] bg-[linear-gradient(145deg,rgba(166,207,116,0.075),transparent_44%),#0d140f] px-5 py-6 sm:px-8 sm:py-8">
          <header className="flex items-center justify-between gap-3 border-b border-[#718667]/25 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center border-2 border-[#a6cf74]/50 bg-[#20301f] text-[#c9e9a8] shadow-[inset_0_0_0_3px_#111a16]">
                <TbBlocks className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-minecraft-text text-sm font-black tracking-wide text-white">PluginsX</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#91ac7c]">Inicialização do mundo</p>
              </div>
            </div>
            <span className="shrink-0 border border-[#718667]/25 px-2 py-1 font-mono text-[9px] font-semibold text-[#94a68b]">
              PX · 01
            </span>
          </header>

          <div className="flex items-center gap-5 py-6 sm:gap-6 sm:py-8">
            <div className="relative grid size-[5.25rem] shrink-0 grid-cols-3 gap-[3px] border-2 border-[#70845d]/45 bg-[#080d09] p-1.5 shadow-[5px_6px_0_#060907] sm:size-24">
              {chunkColors.map((color, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 90}ms` }}
                  className={`chunk-loading-block ${color} border border-black/15`}
                />
              ))}
              <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center border-2 border-[#111a16] bg-[#a6cf74] text-[#1a2915] shadow-[2px_3px_0_#070b08]">
                <TbPick className="size-4" aria-hidden="true" />
              </span>
            </div>

            <div className="min-w-0">
              <p className="font-minecraft-text text-[1.65rem] font-black leading-none tracking-tight text-white sm:text-3xl">
                Loading<span className="text-[#a6cf74]">...</span>
              </p>
              <p className="mt-3 text-xs leading-5 text-[#b3c0ad] sm:text-sm">{detail}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.17em] text-[#8fa184]">
            <span>Sincronizando dados</span>
            <span className="flex items-center gap-1.5 text-[#b9d59b]">
              <span className="size-1.5 animate-pulse bg-[#9fd26b] motion-reduce:animate-none" />
              Aguarde
            </span>
          </div>
          <div
            aria-hidden="true"
            className="chunk-loading-rail relative mt-2 h-2 overflow-hidden border border-[#718667]/25 bg-[#080d09] p-[2px]"
          >
            <div className="chunk-loading-scan h-full w-1/3 bg-[repeating-linear-gradient(90deg,#6f9d4b_0_12px,#a6cf74_12px_16px,#34522f_16px_20px)] shadow-[0_0_12px_rgba(166,207,116,0.45)]" />
          </div>
          <p className="mt-3 font-mono text-[9px] text-[#65735f]">{stage}</p>
        </div>
      </section>
    </div>
  );
}
