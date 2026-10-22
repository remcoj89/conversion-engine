import type { Metadata } from "next";
import type { Seo } from "../content/types";
import { site } from "../content/demo";

export const SITE_URL = process.env.DEMO_SITE_URL ?? "http://localhost:3100";

// Basis-metadata en Open Graph per pagina (GE SEO-basisregels).
export function pageMetadata(seo: Seo, extra: { type?: "website" | "article"; publishedTime?: string } = {}): Metadata {
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: {
      type: extra.type ?? "website",
      locale: "nl_NL",
      siteName: site.name,
      title: seo.title,
      description: seo.description,
      url: seo.path,
      ...(extra.publishedTime ? { publishedTime: extra.publishedTime } : {}),
    },
  };
}
