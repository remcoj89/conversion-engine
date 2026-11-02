import { withBffHandler } from "../../../lib/bff/serverDependencies";
import { createDealsHandler } from "../../../lib/bff/deals";

export const GET = withBffHandler(createDealsHandler);
export const POST = withBffHandler(createDealsHandler);
