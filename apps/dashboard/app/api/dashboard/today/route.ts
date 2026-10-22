const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

const noStore = { "Cache-Control": "no-store" };

// Alleen deze 400-codes zijn bedoeld voor de browser; al het andere wordt generiek.
const forwardedBadRequestErrors = new Set(["tenant_required", "invalid_tenant"]);

export async function GET(request: Request) {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/dashboard/today`, {
      cache: "no-store",
      headers: forwardedHeaders(request),
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      return reply(await response.json(), response.status);
    }
    if (response.status === 400) {
      return reply({ error: await badRequestError(response) }, 400);
    }

    // Body is niet nodig; vrijgeven zodat de verbinding terug kan naar de pool.
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401) return reply({ error: "unauthorized" }, 401);
    if (response.status === 403) return reply({ error: "forbidden" }, 403);
    return reply({ error: "api_unavailable" }, 502);
  } catch {
    // Timeout, netwerkfout of ongeldige JSON in een succesvolle response.
    return reply({ error: "api_unavailable" }, 503);
  }
}

// De BFF beslist niets over auth of tenanttoegang; hij geeft alleen deze twee headers door.
function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of ["authorization", "x-tenant-id"]) {
    const value = request.headers.get(name);
    // Ontbrekend of leeg wordt niet meegestuurd.
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function badRequestError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const error = typeof body === "object" && body !== null && "error" in body ? body.error : undefined;
  return typeof error === "string" && forwardedBadRequestErrors.has(error) ? error : "api_error";
}

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStore });
}
