import { createCrmSettingsHandler } from "../../../../lib/bff/crmSettings";
import { withBffHandler } from "../../../../lib/bff/serverDependencies";

export const GET = withBffHandler(createCrmSettingsHandler);
export const PATCH = withBffHandler(createCrmSettingsHandler);
