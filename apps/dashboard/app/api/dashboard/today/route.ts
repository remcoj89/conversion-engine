import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { createTodayHandler } from "../../../../lib/bff/today";
import { readSessionConfig } from "../../../../lib/session/config";
import { findSession } from "../../../../lib/session/store";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

let handler: ReturnType<typeof createTodayHandler> | undefined;

// Lazy, so `next build` does not need session configuration; a failed attempt is retried next request.
function getHandler() {
  if (!handler) {
    const config = readSessionConfig();
    const pool = new Pool({ connectionString: config.databaseUrl });
    handler = createTodayHandler({
      apiBaseUrl: API_BASE_URL,
      lookupSession: (sessionId) => findSession(pool, config.encryptionKey, sessionId),
      fetch,
    });
  }
  return handler;
}

export async function GET(request: NextRequest) {
  let today: ReturnType<typeof createTodayHandler>;
  try {
    today = getHandler();
  } catch (error) {
    // Config errors name the missing variable, never its value.
    console.error("Session configuration invalid:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "api_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return today(request);
}
