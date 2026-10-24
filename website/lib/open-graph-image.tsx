import { ImageResponse } from "next/og";

const portalBlocks = [
  [0, 0, 52, 52, "#536b42"],
  [58, 0, 52, 52, "#789452"],
  [116, 0, 52, 52, "#536b42"],
  [174, 0, 52, 52, "#789452"],
  [0, 58, 52, 52, "#789452"],
  [174, 58, 52, 52, "#536b42"],
  [0, 116, 52, 52, "#536b42"],
  [174, 116, 52, 52, "#789452"],
  [0, 174, 52, 52, "#789452"],
  [174, 174, 52, 52, "#536b42"],
  [0, 232, 52, 52, "#536b42"],
  [58, 232, 52, 52, "#789452"],
  [116, 232, 52, 52, "#536b42"],
  [174, 232, 52, 52, "#789452"],
] as const;

const stars = [
  [34, 35, 4, "#a6cf74"],
  [364, 56, 5, "#708e54"],
  [330, 120, 3, "#d5d0ba"],
  [30, 249, 4, "#d5d0ba"],
  [372, 282, 4, "#a6cf74"],
  [46, 378, 3, "#708e54"],
  [351, 416, 5, "#d5d0ba"],
  [16, 458, 3, "#a6cf74"],
] as const;

export const openGraphSize = { width: 1200, height: 630 };

const pixelGlyphs: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};

function PixelText({
  text,
  color,
  pixelSize,
}: {
  text: string;
  color: string;
  pixelSize: number;
}) {
  const letterGap = pixelSize / 4;
  const wordGap = pixelSize * 3;
  let left = 0;
  let path = "";

  for (const character of text.toUpperCase()) {
    if (character === " ") {
      left += wordGap + letterGap;
      continue;
    }

    const glyph = pixelGlyphs[character];
    if (!glyph) continue;

    glyph.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== "1") continue;
        const blockX = left + x * pixelSize;
        const blockY = y * pixelSize;
        path += `M${blockX} ${blockY}h${pixelSize}v${pixelSize}h-${pixelSize}z`;
      }
    });

    left += pixelSize * 5 + letterGap;
  }

  const width = Math.max(left - letterGap, 1);
  const height = pixelSize * 7;

  return (
    <svg
      aria-hidden="true"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      style={{ display: "block", flexShrink: 0 }}
    >
      <path d={path} fill={color} />
    </svg>
  );
}

export function createOpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        backgroundColor: "#0b100d",
        color: "#f1f4e9",
        display: "flex",
        fontFamily: "monospace",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          backgroundColor: "#a6cf74",
          height: "100%",
          left: 0,
          position: "absolute",
          top: 0,
          width: 12,
        }}
      />
      <div
        style={{
          backgroundColor: "#182119",
          height: 1,
          left: 72,
          position: "absolute",
          right: 72,
          top: 36,
        }}
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 15,
          left: 76,
          position: "absolute",
          top: 68,
        }}
      >
        <div
          style={{
            alignItems: "center",
            backgroundColor: "#172119",
            border: "1px solid #70815f",
            display: "flex",
            height: 50,
            justifyContent: "center",
            position: "relative",
            width: 50,
          }}
        >
          <div
            style={{
              backgroundColor: "#a6cf74",
              height: 12,
              left: 10,
              position: "absolute",
              top: 10,
              width: 12,
            }}
          />
          <div
            style={{
              backgroundColor: "#5e8249",
              height: 12,
              left: 24,
              position: "absolute",
              top: 10,
              width: 12,
            }}
          />
          <div
            style={{
              backgroundColor: "#d5d0ba",
              height: 12,
              left: 10,
              position: "absolute",
              top: 24,
              width: 12,
            }}
          />
          <div
            style={{
              backgroundColor: "#a6cf74",
              height: 12,
              left: 24,
              position: "absolute",
              top: 24,
              width: 12,
            }}
          />
        </div>
        <PixelText text="PluginsX" color="#f1f4e9" pixelSize={4} />
      </div>

      <div
        style={{
          color: "#a6cf74",
          fontSize: 12,
          left: 80,
          letterSpacing: 2.8,
          position: "absolute",
          top: 158,
        }}
      >
        FERRAMENTAS PARA PAPERMC
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          left: 80,
          position: "absolute",
          top: 210,
        }}
      >
        <PixelText text="Seu servidor." color="#f1f4e9" pixelSize={8} />
        <PixelText text="Suas regras." color="#b9d994" pixelSize={8} />
      </div>
      <div
        style={{
          color: "#bac4b3",
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          fontSize: 16,
          left: 80,
          lineHeight: 1.8,
          position: "absolute",
          top: 382,
        }}
      >
        <span>Plugins, licenças e ferramentas para</span>
        <span>quem mantém o próprio mundo.</span>
      </div>

      <div
        style={{
          alignItems: "center",
          bottom: 75,
          display: "flex",
          gap: 12,
          left: 80,
          position: "absolute",
        }}
      >
        {[
          ["01", "INSTALAR"],
          ["02", "LICENCIAR"],
          ["03", "CONECTAR"],
        ].map(([number, label]) => (
          <div
            key={number}
            style={{
              alignItems: "center",
              border: "1px solid #344334",
              color: "#d9e2d0",
              display: "flex",
              fontSize: 9,
              gap: 8,
              padding: "9px 10px",
            }}
          >
            <span style={{ color: "#a6cf74" }}>{number}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          backgroundColor: "#101711",
          border: "1px solid #344332",
          display: "flex",
          height: 476,
          position: "absolute",
          right: 72,
          top: 72,
          width: 420,
        }}
      >
        <div
          style={{
            alignItems: "center",
            borderBottom: "1px solid #263326",
            boxSizing: "border-box",
            color: "#a6cf74",
            display: "flex",
            fontSize: 10,
            height: 48,
            justifyContent: "space-between",
            letterSpacing: 1.5,
            padding: "0 18px",
            width: "100%",
          }}
        >
          <span>WORLD NODE / 01</span>
          <span style={{ color: "#7b8c71" }}>PAPERMC</span>
        </div>

        <div
          style={{
            backgroundColor: "#0b100d",
            border: "1px solid #273427",
            display: "flex",
            height: 343,
            left: 30,
            overflow: "hidden",
            position: "absolute",
            top: 73,
            width: 358,
          }}
        >
          <div
            style={{
              backgroundColor: "#131c15",
              border: "1px solid #28372a",
              height: 280,
              left: 57,
              position: "absolute",
              top: 28,
              width: 244,
            }}
          />
          <div
            style={{
              backgroundColor: "#101711",
              border: "1px solid #7d9b5b",
              height: 212,
              left: 94,
              position: "absolute",
              top: 63,
              width: 170,
            }}
          />
          <div
            style={{
              backgroundColor: "#1b2b1e",
              border: "1px solid #465d3d",
              height: 156,
              left: 108,
              position: "absolute",
              top: 77,
              width: 142,
            }}
          />
          <div
            style={{
              alignItems: "center",
              backgroundColor: "#131c15",
              border: "1px solid #5e7949",
              color: "#d5d0ba",
              display: "flex",
              fontSize: 11,
              height: 34,
              justifyContent: "center",
              left: 144,
              letterSpacing: 1.2,
              position: "absolute",
              top: 111,
              width: 70,
            }}
          >
            SPX.JAR
          </div>
          <div
            style={{
              backgroundColor: "#a6cf74",
              height: 5,
              left: 124,
              position: "absolute",
              top: 169,
              width: 45,
            }}
          />
          <div
            style={{
              backgroundColor: "#789452",
              height: 5,
              left: 178,
              position: "absolute",
              top: 169,
              width: 56,
            }}
          />
          <div
            style={{
              backgroundColor: "#536b42",
              height: 5,
              left: 142,
              position: "absolute",
              top: 183,
              width: 74,
            }}
          />

          {portalBlocks.map(([left, top, width, height, color]) => (
            <div
              key={`portal-${left}-${top}`}
              style={{
                backgroundColor: color,
                border: "1px solid #263526",
                height,
                left: 66 + left,
                position: "absolute",
                top: 58 + top,
                width,
              }}
            />
          ))}

          {stars.map(([left, top, size, color]) => (
            <div
              key={`spark-${left}-${top}`}
              style={{
                backgroundColor: color,
                height: size,
                left,
                position: "absolute",
                top,
                width: size,
              }}
            />
          ))}

          <div
            style={{
              backgroundColor: "#a6cf74",
              height: 13,
              left: 24,
              position: "absolute",
              top: 296,
              width: 310,
            }}
          />
          <div
            style={{
              backgroundColor: "#526447",
              height: 22,
              left: 38,
              position: "absolute",
              top: 309,
              width: 282,
            }}
          />
          <div
            style={{
              backgroundColor: "#263629",
              height: 12,
              left: 54,
              position: "absolute",
              top: 331,
              width: 250,
            }}
          />
        </div>

        <div
          style={{
            alignItems: "center",
            bottom: 14,
            color: "#7f8e77",
            display: "flex",
            fontSize: 9,
            justifyContent: "space-between",
            left: 18,
            letterSpacing: 1.3,
            position: "absolute",
            right: 18,
          }}
        >
          <span>INSTALL / LICENSE / CONNECT</span>
          <span style={{ color: "#a6cf74" }}>ONLINE</span>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#1b281c",
          bottom: 36,
          height: 1,
          left: 72,
          position: "absolute",
          right: 72,
        }}
      />
      <div
        style={{
          bottom: 15,
          color: "#64715f",
          fontSize: 9,
          left: 78,
          letterSpacing: 1.4,
          position: "absolute",
        }}
      >
        FEITO PARA QUEM CONSTRÓI E MANTÉM MUNDOS
      </div>
      <div
        style={{
          bottom: 15,
          color: "#64715f",
          fontSize: 9,
          letterSpacing: 1.4,
          position: "absolute",
          right: 78,
        }}
      >
        PLUGINSX / 01
      </div>
    </div>,
    openGraphSize,
  );
}
