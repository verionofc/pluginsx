/** Dioramas vetoriais de blocos; nenhum recurso externo ou efeito de ponteiro. */
export function LicenseWorldScene({ edition }: { edition: string }) {
  const end = edition === "lifetime";
  const sky = edition === "aether";

  return (
    <div className="license-world" aria-hidden="true">
      <svg
        aria-hidden="true"
        className="license-world__landscape"
        viewBox="0 0 640 240"
        fill="none"
        preserveAspectRatio="xMidYMax meet"
      >
        {end ? (
          <>
            <path
              d="M0 190h54v-16h56v16h48v20h54v30H0Zm340 22h36v-22h54v-16h80v18h56v-22h74v70H340Z"
              fill="#24202F"
            />
            <path
              d="M42 178V84h20v94M98 178V44h28v134M438 184V74h22v110M544 186V28h30v158"
              stroke="#302039"
              strokeWidth="12"
            />
            <path
              d="M90 48h44M536 32h46M430 78h38"
              stroke="#75538D"
              strokeWidth="4"
            />
            <path
              d="m220 62 34 10 20-14 28 8 24-14 32-20-10 25 28 8 30 26-42-8-20 12-30-10-8 14-26-17-18 10-24-9-24 8 18-18-34-6Z"
              fill="#0D0815"
              stroke="#74518B"
              strokeOpacity="0.4"
            />
            <path d="M302 71h5v3h-5m12-2h5v3h-5" fill="#D59BFF" />
            <path
              d="M148 215h48v-9h70v9h48v10h-24v10h-31v5h-51v-5h-36v-10h-24Z"
              fill="#4B4057"
            />
            <path d="M148 215h48v-9h70v9h48" stroke="#8B7D97" strokeWidth="4" />
          </>
        ) : sky ? (
          <>
            <path
              d="M0 64h34V51h62v13h46v20H0Zm388-32h40V17h63v15h42v17H388ZM472 112h30V99h70v13h68v24H472Z"
              fill="#9BC8D7"
              fillOpacity="0.12"
            />
            <path
              d="M50 142h34v-12h95v12h37v15h-20v20h-23v20h-28v19h-31v-19H92v-20H70v-20H50Z"
              fill="#344B5A"
            />
            <path
              d="M50 142h34v-12h95v12h37"
              stroke="#A1C6BE"
              strokeWidth="7"
            />
            <path
              d="M400 179h37v-14h108v14h47v19h-24v21h-34v21h-70v-21h-33v-21h-31Z"
              fill="#2C4658"
            />
            <path
              d="M400 179h37v-14h108v14h47"
              stroke="#B9D2CB"
              strokeWidth="8"
            />
            <path
              d="M108 127V82h12v45m31 0V82h12v45m-43-39h31"
              stroke="#94B7BD"
              strokeWidth="8"
            />
            <path
              d="M104 77h20v8h-20m23 0h20v8h-20m20-16h20v8h-20"
              fill="#DDC279"
            />
            <path
              d="M452 160v-50h15v50m45 0v-50h15v50m-60-51h45"
              stroke="#7CA6B8"
              strokeWidth="9"
            />
            <path
              d="M444 104h31v8h-31m29-17h32v8h-32m30 9h31v8h-31"
              fill="#CAB57D"
            />
          </>
        ) : (
          <>
            <path
              d="M0 104h55V78h41v24h46v29h54v28h78v30H0Zm342 30h43V92h43V68h47v31h38v23h55V94h40v30h32v116H342Z"
              fill="#233622"
            />
            <path
              d="M0 176h58v-12h69v20h83v15h73v41H0Zm323 34h60v-22h91v-19h77v-12h89v83H323Z"
              fill="#30482B"
            />
            <path
              d="M33 158V98h12v60m-26-49V73h43v36m-31-41V54h22v19m476 99v-60h12v60m-26-48V88h44v36m-33-40V70h24v18"
              fill="#37562F"
            />
            <path d="M33 158v-44h12v44m482 14v-44h12v44" fill="#51402B" />
            <path
              d="M0 211h99v-13h111v13h123v-14h136v-11h171v54H0Z"
              fill="#433529"
            />
            <path
              d="M0 211h99v-13h111v13h123v-14h136v-11h171"
              stroke="#6C8D41"
              strokeWidth="8"
            />
            <path
              d="M20 226h13v7H20m48-8h8v6h-8m88-13h13v8h-13m74 13h9v-7h-9m111-8h12v8h-12m94-7h8v6h-8m90-19h13v7h-13m59 15h10v7h-10"
              fill="#78553B"
            />
            {edition === "monthly" ? (
              <>
                <path
                  d="M340 225h35v-11h65v-11h69v-8h94"
                  stroke="#8D3030"
                  strokeWidth="3"
                />
                <path
                  d="M373 212h6v6h-6m63-18h6v6h-6m70-8h6v6h-6"
                  fill="#E3785D"
                />
                <path
                  d="M441 176h40v25h-40Z"
                  fill="#75532D"
                  stroke="#B18B4D"
                  strokeWidth="3"
                />
                <path
                  d="M441 187h40m-24-3h8v9h-8"
                  stroke="#352B1D"
                  strokeWidth="3"
                />
              </>
            ) : (
              <>
                <path
                  d="m236 175 20-20 30 8 27-26 35 5 32-32"
                  stroke="#D0B479"
                  strokeWidth="2"
                  strokeDasharray="4 7"
                />
                <path
                  d="M378 100v18m-8-9h17"
                  stroke="#E1C783"
                  strokeWidth="2"
                />
                <path d="M560 179v-19" stroke="#8B6A3F" strokeWidth="5" />
                <path d="M555 153h10v10h-10" fill="#F1C46D" />
              </>
            )}
          </>
        )}
      </svg>
      <div className="license-world__particles">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function MinecraftItemIcon({ kind }: { kind: "key" | "world" }) {
  return kind === "key" ? (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1h6v2h1v5h-2v2H9v2H7v2H5v1H1v-4h2V9h2V7h2V3h1V1Z"
        fill="currentColor"
      />
      <path d="M10 3h3v4h-3V3Z" fill="var(--license-shadow)" />
      <path d="M2 12h2v2H2m3-5h2v2H5" fill="#FFFFFF50" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m2 6 8-4 8 4-8 4-8-4Z" fill="var(--license-accent)" />
      <path d="m2 6 8 4v8l-8-4V6Z" fill="var(--license-soil)" />
      <path d="m10 10 8-4v8l-8 4v-8Z" fill="var(--license-rim)" />
      <path d="m2 6 8 4 8-4M10 10v8" stroke="#00000045" />
      <path d="m4 9 3 1.5v2L4 11V9Z" fill="#FFFFFF15" />
    </svg>
  );
}
