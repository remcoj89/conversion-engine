import { createPlatformTenantMutationHandler } from "../../../../lib/bff/platformTenantMutations";
import { createPlatformTenantsHandler } from "../../../../lib/bff/platformTenants";
import { withBffHandler } from "../../../../lib/bff/serverDependencies";

export const GET = withBffHandler(createPlatformTenantsHandler);
export const POST = withBffHandler((dependencies) =>
  createPlatformTenantMutationHandler(dependencies, "create"),
);
