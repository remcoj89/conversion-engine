import { withBffHandler } from "../../../lib/bff/serverDependencies";
import { createOrganizationsHandler } from "../../../lib/bff/organizations";

export const GET = withBffHandler(createOrganizationsHandler);
export const POST = withBffHandler(createOrganizationsHandler);
