import type {
  LeadLifecycleStatus,
  LeadRecord,
  LeadStatusUpdateResult,
} from "../../../lib/bff/leads";

export const leadStatusLabels: Readonly<Record<LeadLifecycleStatus, string>> = {
  new: "Nieuw",
  qualified: "Gekwalificeerd",
  appointment_scheduled: "Afspraak gepland",
  proposal: "Voorstel",
  won: "Gewonnen",
  lost: "Verloren",
};

export function formatLeadStatus(status: LeadLifecycleStatus): string {
  return leadStatusLabels[status];
}

export function leadStatusTone(status: LeadLifecycleStatus): "neutral" | "warning" | "success" {
  if (status === "won") return "success";
  if (status === "lost" || status === "proposal" || status === "appointment_scheduled") return "warning";
  return "neutral";
}

const nextLeadStatusMap: Readonly<Record<LeadLifecycleStatus, readonly LeadLifecycleStatus[]>> = {
  new: ["qualified"],
  qualified: ["appointment_scheduled"],
  appointment_scheduled: ["proposal"],
  proposal: ["won", "lost"],
  won: [],
  lost: [],
};

export function nextLeadStatuses(status: LeadLifecycleStatus): readonly LeadLifecycleStatus[] {
  return nextLeadStatusMap[status];
}

export function isTerminalLeadStatus(status: LeadLifecycleStatus): boolean {
  return nextLeadStatuses(status).length === 0;
}

// Mutations remain server-confirmed; failed requests deliberately return the current lead.
export function applyLeadStatusUpdate(lead: LeadRecord, result: LeadStatusUpdateResult): LeadRecord {
  if (result.status !== "updated") return lead;
  return {
    ...lead,
    status: result.data.status,
    next_action: null,
    updated_at: result.data.updated_at,
  };
}
