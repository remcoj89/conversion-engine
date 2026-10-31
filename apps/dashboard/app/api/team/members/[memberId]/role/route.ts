import { withBffHandler } from "../../../../../../lib/bff/serverDependencies";
import { createTeamMemberRoleHandler } from "../../../../../../lib/bff/teamMembers";

export const PATCH = withBffHandler(createTeamMemberRoleHandler);
