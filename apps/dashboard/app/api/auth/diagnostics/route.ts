import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../lib/session/cookies";
import { getBffDependencies } from "../../../../lib/bff/serverDependencies";
import { inspectAccessToken } from "../../../../lib/auth/tokenDiagnostics";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_DIAGNOSTICS_ENABLED !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  }

  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }

  try {
    const session = await getBffDependencies().lookupSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
    }

    return NextResponse.json(
      {
        environment: "development",
        token: inspectAccessToken(session.accessToken),
        note: "Claim shape only; cryptographic validation and authorization remain enforced by the API.",
      },
      { status: 200, headers: noStore },
    );
  } catch {
    return NextResponse.json({ error: "diagnostics_unavailable" }, { status: 503, headers: noStore });
  }
}
