import { NextRequest } from "next/server";
import { createPlatformTenantDetailHandler } from "../../../../../lib/bff/platformTenantDetails";
import { createPlatformTenantMutationHandler } from "../../../../../lib/bff/platformTenantMutations";
import { getBffDependencies } from "../../../../../lib/bff/serverDependencies";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;
  try {
    return await createPlatformTenantDetailHandler(getBffDependencies())(request, tenantId);
  } catch {
    return Response.json(
      { error: "api_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;
  try {
    return await createPlatformTenantMutationHandler(getBffDependencies(), "rename")(request, tenantId);
  } catch {
    return Response.json(
      { error: "api_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
