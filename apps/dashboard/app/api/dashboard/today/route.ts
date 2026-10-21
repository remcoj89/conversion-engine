const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/dashboard/today`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return Response.json(
        { error: "dashboard_unavailable" },
        { status: 502, headers: noStore },
      );
    }
    return Response.json(await response.json(), { headers: noStore });
  } catch {
    return Response.json(
      { error: "dashboard_unavailable" },
      { status: 503, headers: noStore },
    );
  }
}
