import { NextRequest } from "next/server";
import { createPlatformTenantInvitationHandler } from "../../../../../../lib/bff/platformTenantInvitations";
import { getBffDependencies } from "../../../../../../lib/bff/serverDependencies";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const { tenantId } = await context.params;
  try {
    return await createPlatformTenantInvitationHandler(getBffDependencies())(request, tenantId);
  } catch {
    return Response.json(
      { error: "api_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
