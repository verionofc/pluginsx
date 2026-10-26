/** Mundo Minecraft fixo, construído com blocos CSS e sem imagens. */
export function SiteBackground() {
  return (
    <div className="site-background" aria-hidden="true">
      <div className="site-background__sky" />
      <div className="site-background__stars" />
      <div className="site-background__moon" />
      <div className="site-background__cloud site-background__cloud--left" />
      <div className="site-background__cloud site-background__cloud--right" />
      <div className="site-background__ridge site-background__ridge--far" />
      <div className="site-background__ridge site-background__ridge--near" />
      <div className="site-background__tree site-background__tree--left" />
      <div className="site-background__tree site-background__tree--right" />
      <div className="site-background__island site-background__island--left" />
      <div className="site-background__island site-background__island--right" />
      <div className="site-background__pillars" />
      <div className="site-background__ground" />
      <div className="site-background__vignette" />
    </div>
  );
}
