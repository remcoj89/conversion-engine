import type { Metadata, Viewport } from "next";
import CustomerWorkspaceGate from "./customer-workspace-gate";
import Sidebar from "./sidebar";
import TopbarContext from "./topbar-context";
import ServiceWorkerRegistration from "./service-worker-registration";
import { WorkspaceContextProvider } from "./workspace-context";
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
        <WorkspaceContextProvider>
          <div className="app-shell">
            <Sidebar />
            <div className="app-main">
              <header className="topbar">
                <TopbarContext />
                <span className="badge">Conversion Engine</span>
              </header>
              <main id="content" className="content">
                <CustomerWorkspaceGate>{children}</CustomerWorkspaceGate>
              </main>
            </div>
          </div>
        </WorkspaceContextProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
