import { NextRequest } from "next/server";
import { createPlatformTenantMutationHandler } from "../../../../../../lib/bff/platformTenantMutations";
import { getBffDependencies } from "../../../../../../lib/bff/serverDependencies";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;
  try {
    return await createPlatformTenantMutationHandler(getBffDependencies(), "reactivate")(request, tenantId);
  } catch {
    return Response.json(
      { error: "api_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
