import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/config";

// Dynamic social-share card (Open Graph + Twitter). Jet-black + monochrome to
// match the app's theme, with the fist-in-flame logo. Generated at build/request
// time so it always tracks the brand constants. Only the flexbox subset of CSS
// is supported by next/og; the logo is inlined as a base64 data URI (Node
// runtime), which is the pattern Next documents for local og-image assets.

export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/icons/logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#000000",
          color: "#ededee",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "36px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={172} height={172} alt="" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 130,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                color: "#ffffff",
              }}
            >
              {APP_NAME}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 30,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "#8a8a90",
              }}
            >
              {APP_TAGLINE}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 44,
            fontSize: 34,
            lineHeight: 1.4,
            maxWidth: 1000,
            color: "#8a8a90",
          }}
        >
          {APP_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size },
  );
}
