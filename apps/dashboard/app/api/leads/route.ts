import { withBffHandler } from "../../../lib/bff/serverDependencies";
import { createLeadsHandler } from "../../../lib/bff/leads";

export const GET = withBffHandler(createLeadsHandler);
