import { createApiProxy, type ApiProxyDependencies } from "./apiProxy";

export type TodayHandlerDependencies = ApiProxyDependencies;

// GET /api/dashboard/today → GET /v1/dashboard/today.
export function createTodayHandler(dependencies: TodayHandlerDependencies) {
  return createApiProxy(dependencies, {
    apiPath: "/v1/dashboard/today",
    method: "GET",
    // Alleen deze 400-codes zijn bedoeld voor de browser; al het andere wordt generiek.
    forwardedErrors: [
      { status: 400, error: "tenant_required" },
      { status: 400, error: "invalid_tenant" },
    ],
  });
}
