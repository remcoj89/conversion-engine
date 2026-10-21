import type { Metadata, Viewport } from "next";
import Sidebar from "./sidebar";
import ServiceWorkerRegistration from "./service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conversion Engine",
  description: "Dashboard van de Westend Digital Conversion Engine.",
};

export const viewport: Viewport = {
  themeColor: "#234cd5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>
        <a href="#content" className="skip-link">
          Naar hoofdinhoud
        </a>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <header className="topbar">
              <p className="topbar-context">
                Klantomgeving <span aria-hidden="true">/</span>{" "}
                <strong>Vandaag</strong>
              </p>
              <span className="badge">Conversion Engine</span>
            </header>
            <main id="content" className="content">
              {children}
            </main>
          </div>
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
