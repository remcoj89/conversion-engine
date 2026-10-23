import { createApiProxy, type ApiProxyDependencies, type ForwardedError } from "./apiProxy";

// Ruim boven de API-limiet van 256 KB valt niets door te sturen; de API controleert zelf ook.
const MAX_BODY_BYTES = 300 * 1024;

// Fouten die de onboarding-UI nodig heeft, met alleen de velden die de API daarvoor teruggeeft.
const forwardedErrors: readonly ForwardedError[] = [
  { status: 400, error: "tenant_required" },
  { status: 400, error: "invalid_tenant" },
  { status: 400, error: "invalid_body" },
  { status: 400, error: "invalid_answers", fields: ["issues"] },
  { status: 400, error: "incomplete_answers", fields: ["missing"] },
  { status: 409, error: "version_conflict", fields: ["current_version"] },
  { status: 409, error: "schema_mismatch", fields: ["schema_id", "schema_version"] },
  { status: 409, error: "not_editable" },
  { status: 413, error: "payload_too_large" },
];

// GET/PUT /api/onboarding → GET/PUT /v1/onboarding/current en POST /api/onboarding → POST /v1/onboarding/current/submit,
// met hetzelfde sessie- en tokenpatroon als today.
export function createOnboardingHandlers(dependencies: ApiProxyDependencies) {
  return {
    GET: createApiProxy(dependencies, { apiPath: "/v1/onboarding/current", method: "GET", forwardedErrors }),
    PUT: createApiProxy(dependencies, { apiPath: "/v1/onboarding/current", method: "PUT", forwardedErrors, maxBodyBytes: MAX_BODY_BYTES }),
    POST: createApiProxy(dependencies, { apiPath: "/v1/onboarding/current/submit", method: "POST", forwardedErrors, maxBodyBytes: MAX_BODY_BYTES }),
  };
}
