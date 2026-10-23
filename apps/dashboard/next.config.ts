import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Laat Next de TypeScript-configuratie en typecheck via de TypeScript 6-API in een worker uitvoeren
    // in plaats van via een tsc-subproces. Die CLI-route parset de stdout van `tsc --showConfig` als JSON
    // en faalt zodra de omgeving (bijv. een NODE_OPTIONS-preload) iets extra's naar stdout schrijft.
    // Typechecking blijft volledig actief.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
