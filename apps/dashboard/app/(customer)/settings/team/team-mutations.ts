import type { WorkspaceFetch } from "../../../../lib/session/context";
import {
  parseTeamMember,
  type CrmPermission,
  type TeamMember,
  type TeamMemberRole,
} from "./team-data";

export type TeamMutationResult =
  | Readonly<{ status: "success"; member: TeamMember }>
  | Readonly<{ status: "invalid" | "unauthenticated" | "forbidden" | "not_found" | "unavailable" }>;

export function updateCrmPermission(
  fetcher: WorkspaceFetch,
  memberId: string,
  permission: CrmPermission,
  enabled: boolean,
): Promise<TeamMutationResult> {
  if (!memberId.trim()) return Promise.resolve({ status: "invalid" });
  return patchMember(fetcher, `/api/team/members/${encodeURIComponent(memberId)}/permissions`, {
    permission,
    enabled,
  });
}

export function updateTeamMemberRole(
  fetcher: WorkspaceFetch,
  memberId: string,
  role: Exclude<TeamMemberRole, "owner">,
): Promise<TeamMutationResult> {
  if (!memberId.trim()) return Promise.resolve({ status: "invalid" });
  return patchMember(fetcher, `/api/team/members/${encodeURIComponent(memberId)}/role`, { role });
}

async function patchMember(
  fetcher: WorkspaceFetch,
  path: string,
  body: Readonly<Record<string, boolean | string>>,
): Promise<TeamMutationResult> {
  try {
    const response = await fetcher(path, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { status: mutationStatus(response.status) };

    const member = parseTeamMember(payload);
    return member ? { status: "success", member } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

function mutationStatus(status: number): Exclude<TeamMutationResult["status"], "success"> {
  if (status === 400) return "invalid";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "unavailable";
}
