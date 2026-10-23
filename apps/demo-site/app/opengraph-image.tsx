import { ImageResponse } from "next/og";
import { site } from "../content/demo";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Standaard Open Graph-afbeelding voor alle pagina's, zonder externe assets.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#29243b",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.85 }}>{site.name}</div>
        <div style={{ fontSize: 64, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>{site.tagline}</div>
        <div style={{ fontSize: 28, marginTop: 40, color: "#f5c36a" }}>Demowebsite · fictieve content</div>
      </div>
    ),
    size,
  );
}
