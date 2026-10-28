import type { FastifyInstance } from "fastify";
import { getIdentityAuthContext } from "../auth/identityAuthHook.js";
import { readRequestedTenantId } from "../auth/authHook.js";
import { UUID_PATTERN } from "../auth/requestContext.js";
import type { Membership, TenantRole } from "../auth/types.js";
import type { TenantLoader, TenantSummary } from "../tenants/tenantLoader.js";

export type SessionContextRouteDependencies = Readonly<{
  tenantLoader: TenantLoader;
}>;

type LoadedTenant = Readonly<{
  membership: Membership;
  tenant: TenantSummary;
}>;

type SessionTenant = Readonly<{
  id: string;
  name: string;
  status: string;
  role: TenantRole;
}>;

type SessionContextResponse = Readonly<{
  workspace: "customer";
  tenant: SessionTenant | null;
  memberships: readonly SessionTenant[];
  tenant_selection_required: boolean;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };

// Must be registered behind the identity auth hook. It deliberately does not use the existing
// tenant-selecting auth hook, because this endpoint is the source for tenant selection itself.
export function registerSessionContextRoutes(
  app: FastifyInstance,
  { tenantLoader }: SessionContextRouteDependencies,
) {
  app.get("/v1/session/context", async (request, reply) => {
    reply.headers(NO_STORE_HEADER);

    const context = getIdentityAuthContext(request);
    // Defense in depth: do not trust a resolver to keep filtering active memberships forever.
    const activeMemberships = context.memberships.filter(
      (membership) => membership.status === "active",
    );
    if (activeMemberships.length === 0) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const requestedTenantId = readRequestedTenantId(request);
    if (requestedTenantId !== undefined && !UUID_PATTERN.test(requestedTenantId)) {
      return reply.code(400).send({ error: "invalid_tenant" });
    }

    const requestedTenant = requestedTenantId
      ? findMembership(activeMemberships, requestedTenantId)
      : undefined;
    if (requestedTenantId !== undefined && !requestedTenant) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const loadedTenants = await loadOwnedTenants(activeMemberships, tenantLoader);
    if (!loadedTenants) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const responseMemberships = loadedTenants.map(toSessionTenant);
    const selectedTenant = requestedTenantId
      ? loadedTenants.find((loaded) => loaded.membership.tenantId.toLowerCase() === requestedTenantId.toLowerCase())
      : activeMemberships.length === 1
        ? loadedTenants[0]
        : undefined;

    const response: SessionContextResponse = {
      workspace: "customer",
      tenant: selectedTenant ? toSessionTenant(selectedTenant) : null,
      memberships: responseMemberships,
      tenant_selection_required: selectedTenant === undefined,
    };
    return response;
  });
}

function findMembership(
  memberships: readonly Membership[],
  requestedTenantId: string,
): Membership | undefined {
  const requested = requestedTenantId.toLowerCase();
  return memberships.find((membership) => membership.tenantId.toLowerCase() === requested);
}

// Tenant names and statuses are never inferred from membership data. A missing or mismatched
// loader result fails closed rather than returning a partial tenant list.
async function loadOwnedTenants(
  memberships: readonly Membership[],
  tenantLoader: TenantLoader,
): Promise<readonly LoadedTenant[] | null> {
  const loaded = await Promise.all(
    memberships.map(async (membership): Promise<LoadedTenant | null> => {
      const tenant = await tenantLoader(membership.tenantId);
      if (
        !tenant
        || tenant.status !== "active"
        || tenant.id.toLowerCase() !== membership.tenantId.toLowerCase()
      ) {
        return null;
      }
      return { membership, tenant };
    }),
  );

  return loaded.every((item): item is LoadedTenant => item !== null) ? loaded : null;
}

function toSessionTenant({ membership, tenant }: LoadedTenant): SessionTenant {
  return {
    // The ID comes from the user's own membership; loader data supplies only name and status.
    id: membership.tenantId,
    name: tenant.name,
    status: tenant.status,
    role: membership.role,
  };
}
