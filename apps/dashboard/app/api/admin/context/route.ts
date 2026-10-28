import { createPlatformContextHandler } from "../../../../lib/bff/platformContext";
import { withBffHandler } from "../../../../lib/bff/serverDependencies";

export const GET = withBffHandler(createPlatformContextHandler);
