import { createPlatformAuditEventsHandler } from "../../../../lib/bff/platformAuditEvents";
import { withBffHandler } from "../../../../lib/bff/serverDependencies";

export const GET = withBffHandler(createPlatformAuditEventsHandler);
