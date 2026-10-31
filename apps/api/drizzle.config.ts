import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Al gezette omgevingsvariabelen gaan voor; .env vult alleen aan.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.MIGRATOR_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("MIGRATOR_DATABASE_URL is required for Drizzle migrations");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
