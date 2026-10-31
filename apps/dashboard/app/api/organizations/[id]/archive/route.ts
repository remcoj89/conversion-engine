import { withBffHandler } from "../../../../../lib/bff/serverDependencies";
import { createOrganizationArchiveHandler } from "../../../../../lib/bff/organizations";

export const POST = withBffHandler(createOrganizationArchiveHandler);
