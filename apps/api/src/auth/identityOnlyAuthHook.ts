import type { FastifyReply, FastifyRequest } from "fastify";
import { hasStrongAuthAssurance } from "./assurance.js";
import type { AuthAdapter, ExternalIdentity } from "./types.js";
import { ensureDatabaseRequestContext, setDatabaseIdentity } from "../db/requestContext.js";

declare module "fastify" {
  interface FastifyRequest {
    // Set only after authentication and assurance validation have succeeded.
    externalIdentity?: ExternalIdentity;
  }
}

export type IdentityOnlyAuthHookDependencies = Readonly<{
  authAdapter: AuthAdapter;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };

// This scope authenticates an identity without requiring an existing local user or membership.
// It is intentionally separate from session-context auth: invitation acceptance is the path that
// creates the first local user and owner membership for a tenant.
export function createIdentityOnlyAuthHook({ authAdapter }: IdentityOnlyAuthHookDependencies) {
  return async function identityOnlyAuthHook(request: FastifyRequest, reply: FastifyReply) {
    reply.headers(NO_STORE_HEADER);

    const auth = await authAdapter.authenticate(request);
    if (auth.status !== "authenticated") {
      request.log.info({ authOutcome: auth.status }, "identity-only request rejected");
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!hasStrongAuthAssurance(auth.identity)) {
      request.log.info({ authOutcome: "insufficient_assurance" }, "identity-only request rejected");
      return reply.code(403).send({ error: "insufficient_assurance" });
    }

    const databaseContext = ensureDatabaseRequestContext(request);
    setDatabaseIdentity(databaseContext, auth.identity.subject, "identity_only");
    request.externalIdentity = auth.identity;
  };
}

export function getExternalIdentity(request: FastifyRequest): ExternalIdentity {
  if (!request.externalIdentity) {
    throw new Error("External identity missing on identity-only route");
  }
  return request.externalIdentity;
}
