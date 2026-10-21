import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = { logger: true }) {
  const app = Fastify(options);

  app.get("/health", async () => {
    return { status: "ok", service: "conversion-engine-api" };
  });

  return app;
}
