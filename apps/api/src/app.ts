import Fastify, { type FastifyServerOptions } from "fastify";
import { createAuthHook, type AuthHookDependencies } from "./auth/authHook.js";
import { apiErrorHandler } from "./errors.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

export type AppDependencies = AuthHookDependencies;

export function buildApp(
  dependencies: AppDependencies,
  options: FastifyServerOptions = { logger: true },
) {
  const app = Fastify(options);

  // Set on the root before any register, so every encapsulated scope inherits it.
  app.setErrorHandler(apiErrorHandler);

  // Public routes live on the root instance.
  app.get("/health", async () => {
    return { status: "ok", service: "conversion-engine-api" };
  });

  // Everything registered in this encapsulated scope requires an auth context.
  app.register(async (protectedApp) => {
    protectedApp.addHook("onRequest", createAuthHook(dependencies));
    registerDashboardRoutes(protectedApp);
  });

  return app;
}
