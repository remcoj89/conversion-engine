import { NextRequest } from "next/server";
import { createInvitationAcceptHandler } from "../../../../lib/bff/invitations";
import { getBffDependencies } from "../../../../lib/bff/serverDependencies";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    return await createInvitationAcceptHandler(getBffDependencies())(request);
  } catch {
    return Response.json(
      { error: "api_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
