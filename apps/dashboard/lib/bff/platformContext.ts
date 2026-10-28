import type { NextRequest } from "next/server";
import { createApiProxy, type ApiProxyDependencies } from "./apiProxy";

export type PlatformContextHandlerDependencies = ApiProxyDependencies;
export type PlatformContextHandler = (request: NextRequest) => Promise<Response>;

// GET /api/admin/context → GET /v1/platform/context.
// Platform authorization is decided by the API; no tenant header is forwarded.
export function createPlatformContextHandler(
  dependencies: PlatformContextHandlerDependencies,
): PlatformContextHandler {
  return createApiProxy(dependencies, {
    apiPath: "/v1/platform/context",
    method: "GET",
    forwardedErrors: [],
    forwardTenantHeader: false,
  });
}
