import type { FastifyInstance } from "fastify";
import { UUID_PATTERN } from "../auth/requestContext.js";
import { getPlatformAdminContext } from "../auth/platformAdminAuthHook.js";
import type { PlatformTenantDetail, PlatformTenantDetailRepository } from "../platform/platformTenantDetailRepository.js";

export type PlatformTenantDetailRouteDependencies = Readonly<{
  platformTenantDetailRepository: PlatformTenantDetailRepository;
}>;

const NO_STORE_HEADER = { "cache-control": "no-store" };

// Must be registered in the Platform Admin sibling scope. The path is the only tenant selector;
// x-tenant-id is deliberately never read by this route.
export function registerPlatformTenantDetailRoutes(
  app: FastifyInstance,
  { platformTenantDetailRepository }: PlatformTenantDetailRouteDependencies,
) {
  app.get("/v1/platform/tenants/:tenantId", async (request, reply) => {
    getPlatformAdminContext(request);
    reply.headers(NO_STORE_HEADER);

    const tenantId = readTenantId(request.params);
    if (!tenantId) return reply.code(400).send({ error: "invalid_tenant_id" });

    const detail = await platformTenantDetailRepository.findById(tenantId);
    if (!detail) return reply.code(404).send({ error: "not_found" });

    return toResponse(detail);
  });
}

function readTenantId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const tenantId = (value as Record<string, unknown>).tenantId;
  return typeof tenantId === "string" && UUID_PATTERN.test(tenantId) ? tenantId : null;
}

function toResponse(detail: PlatformTenantDetail) {
  return {
    id: detail.id,
    name: detail.name,
    status: detail.status,
    created_at: detail.createdAt.toISOString(),
    onboarding: detail.onboarding
      ? {
        status: detail.onboarding.status,
        version: detail.onboarding.version,
        updated_at: detail.onboarding.updatedAt.toISOString(),
      }
      : null,
    website_summary: {
      total: detail.websiteSummary.total,
      active: detail.websiteSummary.active,
    },
  };
}
