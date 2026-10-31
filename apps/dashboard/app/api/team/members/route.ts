import { withBffHandler } from "../../../../lib/bff/serverDependencies";
import { createTeamMembersHandler } from "../../../../lib/bff/teamMembers";

export const GET = withBffHandler(createTeamMembersHandler);
