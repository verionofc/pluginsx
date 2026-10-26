import type { ServerIconId } from "@/lib/server-profiles";

export function ServerItemIcon({ icon = "grass" }: { icon?: ServerIconId }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="server-item-icon"
      data-server-icon={icon}
    >
      {icon === "chest" ? (
        <>
          <path
            d="M2 5h16v12H2V5Z"
            fill="#9B6F35"
            stroke="#392B19"
            strokeWidth="2"
          />
          <path d="M2 9h16M5 4v13m10-13v13" stroke="#4C391F" />
          <path d="M8 8h4v5H8V8Z" fill="#D5D4B6" />
          <path d="M3 5h14" stroke="#D0A45E" />
        </>
      ) : icon === "diamond" ? (
        <>
          <path
            d="M6 2h8v2h2v3h2v4h-2v3h-3v3H7v-3H4v-3H2V7h2V4h2V2Z"
            fill="#6FE5E7"
          />
          <path d="M7 3h6v4H7m-3 1h4v5H4" fill="#C7FFFF" />
          <path d="M14 5h2v6h-2v3h-3v3H8v-3h3v-3h3V5Z" fill="#228FAD" />
        </>
      ) : icon === "redstone" ? (
        <>
          <path
            d="M8 2h5v3h3v4h-3v4h4v4h-6v-3H7v4H2v-5h3V9H3V5h5V2Z"
            fill="#B4433D"
          />
          <path d="M9 3h3v3H9m2 2h3v3h-3M3 14h3v2H3" fill="#F18870" />
          <path d="M7 9h4v4H7" fill="#E35B48" />
        </>
      ) : icon === "crafting" ? (
        <>
          <path d="m2 6 8-4 8 4v10l-8 3-8-4V6Z" fill="#9E7445" />
          <path d="m2 6 8 4 8-4-8-4-8 4Z" fill="#C6A474" />
          <path
            d="m5 5 8 4m-5-6 8 4M6 12v4m8-5v4M10 10v9"
            stroke="#4F3824"
            strokeWidth="2"
          />
          <path d="m4 7 6-3m1 5 5-3" stroke="#6F4F32" />
        </>
      ) : icon === "sword" ? (
        <>
          <path d="M13 1h5v5l-7 7-4-4 6-8Z" fill="#D8E5E2" />
          <path d="m16 3-7 8" stroke="#8AACA9" strokeWidth="2" />
          <path d="m5 7 8 8-2 2-8-8 2-2Z" fill="#78AEB2" />
          <path d="m6 12 2 2-4 4H1v-3l5-3Z" fill="#937447" />
        </>
      ) : icon === "beacon" ? (
        <>
          <path d="M3 13h14v5H3v-5Z" fill="#BDC9BA" />
          <path d="M5 10h10v4H5v-4Z" fill="#7D9390" />
          <path
            d="M6 3h8v8H6V3Z"
            fill="#78D3DF"
            stroke="#C5F7EE"
            strokeWidth="2"
          />
          <path d="M8 4h3v5H8V4Z" fill="#E3FFFF" />
          <path d="M8 1h4" stroke="#D8EED0" />
        </>
      ) : icon === "portal" ? (
        <>
          <path
            d="M4 2h12v16H4V2Z"
            fill="#35283F"
            stroke="#72617F"
            strokeWidth="2"
          />
          <path d="M7 5h6v10H7V5Z" fill="#9658BE" />
          <path d="M8 6h3v3H8m2 2h3v3h-3" fill="#C494E6" />
          <path d="M2 17h16v2H2" fill="#61506C" />
        </>
      ) : (
        <>
          <path d="m2 6 8-4 8 4-8 4-8-4Z" fill="#8CBD61" />
          <path d="m2 6 8 4v8l-8-4V6Z" fill="#91663F" />
          <path d="m10 10 8-4v8l-8 4v-8Z" fill="#604C31" />
          <path d="m2 6 8 4 8-4v3l-8 4-8-4V6Z" fill="#61913D" />
          <path d="m4 10 3 1.5v2L4 12V10Z" fill="#B48656" />
        </>
      )}
    </svg>
  );
}
