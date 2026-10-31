import { withBffHandler } from "../../../lib/bff/serverDependencies";
import { createContactsHandler } from "../../../lib/bff/contacts";

export const GET = withBffHandler(createContactsHandler);
export const POST = withBffHandler(createContactsHandler);
