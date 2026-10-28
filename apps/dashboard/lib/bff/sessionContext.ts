import type { NextRequest } from "next/server";
import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

export type SessionContextHandlerDependencies = ApiProxyDependencies;
export type SessionContextHandler = (request: NextRequest) => Promise<Response>;

const forwardedErrors: readonly ForwardedError[] = [{ status: 400, error: "invalid_tenant" }];

// GET /api/session/context → GET /v1/session/context.
export function createSessionContextHandler(dependencies: SessionContextHandlerDependencies): SessionContextHandler {
  return createApiProxy(dependencies, {
    apiPath: "/v1/session/context",
    method: "GET",
    forwardedErrors,
  });
}
