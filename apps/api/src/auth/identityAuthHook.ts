import type { FastifyReply, FastifyRequest } from "fastify";
import { hasStrongAuthAssurance } from "./assurance.js";
import type { AuthAdapter, Membership, MembershipResolver } from "./types.js";
import { ensureDatabaseRequestContext, setDatabaseIdentity } from "../db/requestContext.js";

declare module "fastify" {
  interface FastifyRequest {
    // Set only after authentication and membership resolution have succeeded.
    identityAuthContext?: IdentityAuthContext;
  }
}

export type IdentityAuthContext = Readonly<{
  memberships: readonly Membership[];
}>;

export type IdentityAuthHookDependencies = Readonly<{
  authAdapter: AuthAdapter;
  membershipResolver: MembershipResolver;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };

// Authenticates the caller without selecting a tenant. Tenant selection belongs to the
// session-context route so multi-tenant callers can receive safe choices first.
export function createIdentityAuthHook({ authAdapter, membershipResolver }: IdentityAuthHookDependencies) {
  return async function identityAuthHook(request: FastifyRequest, reply: FastifyReply) {
    reply.headers(NO_STORE_HEADER);

    const auth = await authAdapter.authenticate(request);
    if (auth.status !== "authenticated") {
      // Never log the reason, identity or credentials; the outcome is enough.
      request.log.info({ authOutcome: auth.status }, "session context request rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!hasStrongAuthAssurance(auth.identity)) {
      request.log.info({ authOutcome: "insufficient_assurance" }, "session context request rejected");
      return reply.code(403).send({ error: "insufficient_assurance" });
    }

    const databaseContext = ensureDatabaseRequestContext(request);
    setDatabaseIdentity(databaseContext, auth.identity.subject, "identity");

    const memberships = (await membershipResolver(auth.identity)).filter(
      (membership) => membership.status === "active",
    );
    if (memberships.length === 0) {
      request.log.info({ authOutcome: "membership_forbidden" }, "session context request rejected");
      return reply.code(403).send({ error: "forbidden" });
    }

    request.identityAuthContext = Object.freeze({ memberships: Object.freeze(memberships) });
  };
}

// Returns the context of a session-context route; throws when the identity hook did not run.
export function getIdentityAuthContext(request: FastifyRequest): IdentityAuthContext {
  if (!request.identityAuthContext) {
    throw new Error("Identity auth context missing on session context route");
  }
  return request.identityAuthContext;
}
