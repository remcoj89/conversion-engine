import type { FastifyInstance } from "fastify";
import { getPlatformAdminContext } from "../auth/platformAdminAuthHook.js";

const NO_STORE_HEADER = { "cache-control": "no-store" };

// Must be registered behind createPlatformAdminAuthHook. The response deliberately contains no
// identity, assignment, tenant or provider data.
export function registerPlatformContextRoutes(app: FastifyInstance) {
  app.get("/v1/platform/context", async (request, reply) => {
    reply.headers(NO_STORE_HEADER);
    getPlatformAdminContext(request);
    return { workspace: "admin", role: "platform_admin" } as const;
  });
}
