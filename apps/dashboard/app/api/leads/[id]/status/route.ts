import { withBffHandler } from "../../../../../lib/bff/serverDependencies";
import { createLeadStatusHandler } from "../../../../../lib/bff/leads";

export const PATCH = withBffHandler(createLeadStatusHandler);
