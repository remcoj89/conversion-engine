import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createDealDetailHandler, createDealUpdateHandler } from "../../../../lib/bff/deals";

export const GET = withBffHandler(createDealDetailHandler);
export const PATCH = withBffHandler(createDealUpdateHandler);
