import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createTodayHandler } from "../../../../lib/bff/today";

export const GET = withBffHandler(createTodayHandler);
