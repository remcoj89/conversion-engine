import { withBffHandler } from "../../../../../lib/bff/serverDependencies";
import { createDealArchiveHandler } from "../../../../../lib/bff/deals";

export const POST = withBffHandler(createDealArchiveHandler);
