import type { FastifyReply, FastifyRequest } from "fastify";
import { hasStrongAuthAssurance } from "./assurance.js";
import { resolvePlatformAdminContext, type PlatformAdminContext } from "./platformAdminContext.js";
import type { AuthAdapter, PlatformAdminAssignmentResolver } from "./types.js";
import { ensureDatabaseRequestContext, setDatabaseIdentity, setDatabasePlatformAdmin } from "../db/requestContext.js";

declare module "fastify" {
  interface FastifyRequest {
    // Set only after identity authentication and platform-right authorization succeed.
    platformAdminContext?: PlatformAdminContext;
  }
}

export type PlatformAdminAuthHookDependencies = Readonly<{
  authAdapter: AuthAdapter;
  platformAdminAssignmentResolver: PlatformAdminAssignmentResolver;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };

export function createPlatformAdminAuthHook({
  authAdapter,
  platformAdminAssignmentResolver,
}: PlatformAdminAuthHookDependencies) {
  return async function platformAdminAuthHook(request: FastifyRequest, reply: FastifyReply) {
    reply.headers(NO_STORE_HEADER);

    const auth = await authAdapter.authenticate(request);
    if (auth.status !== "authenticated") {
      // Never log the reason, identity or credentials; the outcome is enough.
      request.log.info({ authOutcome: auth.status }, "platform request rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!hasStrongAuthAssurance(auth.identity)) {
      request.log.info({ authOutcome: "insufficient_assurance" }, "platform request rejected");
      return reply.code(403).send({ error: "insufficient_assurance" });
    }

    const databaseContext = ensureDatabaseRequestContext(request);
    setDatabaseIdentity(databaseContext, auth.identity.subject, "identity");

    const assignments = await platformAdminAssignmentResolver.resolve(auth.identity);
    const result = resolvePlatformAdminContext(assignments);
    if (result.status === "forbidden") {
      request.log.info({ authOutcome: "platform_forbidden" }, "platform request rejected");
      return reply.code(403).send({ error: "forbidden" });
    }

    request.platformAdminContext = result.context;
    setDatabasePlatformAdmin(databaseContext, auth.identity.subject);
  };
}

export function getPlatformAdminContext(request: FastifyRequest): PlatformAdminContext {
  if (!request.platformAdminContext) {
    throw new Error("Platform admin context missing on protected route");
  }
  return request.platformAdminContext;
}
