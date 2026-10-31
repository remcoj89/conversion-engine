import { withBffHandler } from "../../../../../../lib/bff/serverDependencies";
import { createTeamMemberPermissionHandler } from "../../../../../../lib/bff/teamMembers";

export const PATCH = withBffHandler(createTeamMemberPermissionHandler);
