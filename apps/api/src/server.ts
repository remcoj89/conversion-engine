import { buildApp } from "./app.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const app = buildApp();

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error, "Server kon niet starten");
  process.exit(1);
}
