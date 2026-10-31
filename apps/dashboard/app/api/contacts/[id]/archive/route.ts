import { withBffHandler } from "../../../../../lib/bff/serverDependencies";
import { createContactArchiveHandler } from "../../../../../lib/bff/contacts";

export const POST = withBffHandler(createContactArchiveHandler);
