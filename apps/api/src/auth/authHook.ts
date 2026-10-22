import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveRequestContext, type RequestContext } from "./requestContext.js";
import type { AuthAdapter, MembershipResolver } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    // Only set after successful authentication and tenant selection.
    authContext?: RequestContext;
  }
}

export type AuthHookDependencies = {
  authAdapter: AuthAdapter;
  membershipResolver: MembershipResolver;
};

export function createAuthHook({ authAdapter, membershipResolver }: AuthHookDependencies) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const auth = await authAdapter.authenticate(request);
    if (auth.status !== "authenticated") {
      // Never log the reason or credentials; the outcome is enough.
      request.log.info({ authOutcome: auth.status }, "request rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }

    const memberships = await membershipResolver(auth.identity);
    const result = resolveRequestContext(memberships, readRequestedTenantId(request));

    switch (result.status) {
      case "success":
        request.authContext = result.context;
        return;
      case "tenant_required":
      case "invalid_tenant":
        request.log.info({ authOutcome: result.status }, "request rejected");
        return reply.code(400).send({ error: result.status });
      case "membership_forbidden":
        request.log.info({ authOutcome: result.status }, "request rejected");
        return reply.code(403).send({ error: "forbidden" });
    }
  };
}

// Returns the context of a protected route; throws (500, no data) when the auth hook did not run.
export function getAuthContext(request: FastifyRequest): RequestContext {
  if (!request.authContext) {
    throw new Error("Auth context missing on protected route");
  }
  return request.authContext;
}

// The tenant is only read from this header, never from body or query. An empty header counts as absent.
function readRequestedTenantId(request: FastifyRequest): string | undefined {
  const value = request.headers["x-tenant-id"];
  // Repeated headers are joined, so they can never pass UUID validation.
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw === "" ? undefined : raw;
}
