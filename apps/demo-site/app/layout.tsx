import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { pageSeo, site } from "../content/demo";
import { SITE_URL } from "../lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${pageSeo.home.title} | ${site.name}`, template: `%s | ${site.name}` },
  description: pageSeo.home.description,
  applicationName: site.name,
  // Demowebsite: nooit indexeren.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: site.name,
    title: pageSeo.home.title,
    description: pageSeo.home.description,
  },
};

export const viewport: Viewport = {
  themeColor: "#1f5c4a",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <a href="#inhoud" className="skip-link">
          Naar hoofdinhoud
        </a>
        <p className="demo-notice">{site.demoNotice}</p>
        <SiteHeader />
        <main id="inhoud" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
