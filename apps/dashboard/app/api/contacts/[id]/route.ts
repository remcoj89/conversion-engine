import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createContactDetailHandler } from "../../../../lib/bff/contacts";

export const GET = withBffHandler(createContactDetailHandler);
export const PATCH = withBffHandler(createContactDetailHandler);
