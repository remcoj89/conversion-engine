import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createSessionContextHandler } from "../../../../lib/bff/sessionContext";

export const GET = withBffHandler(createSessionContextHandler);
