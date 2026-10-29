import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createLeadDetailHandler } from "../../../../lib/bff/leads";

export const GET = withBffHandler(createLeadDetailHandler);
