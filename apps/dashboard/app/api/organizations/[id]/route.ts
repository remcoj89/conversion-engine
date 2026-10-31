import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createOrganizationDetailHandler } from "../../../../lib/bff/organizations";

export const GET = withBffHandler(createOrganizationDetailHandler);
export const PATCH = withBffHandler(createOrganizationDetailHandler);
