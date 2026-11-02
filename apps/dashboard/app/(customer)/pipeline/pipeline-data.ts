import {
  LEAD_LIFECYCLE_STATUSES,
  type LeadLifecycleStatus,
  type LeadListResult,
  type LeadRecord,
} from "../../../lib/bff/leads";
import {
  type DealListResult,
  type DealRecord,
  type DealStage,
} from "../../../lib/bff/deals";
import { formatLeadStatus, leadStatusTone } from "../leads/lead-lifecycle";

export type PipelineColumn = Readonly<{
  status: LeadLifecycleStatus;
  label: string;
  tone: "neutral" | "warning" | "success";
  leads: readonly LeadRecord[];
}>;

export type PipelineState =
  | { kind: "ready"; data: readonly PipelineColumn[]; hasLeads: boolean; hasNextPage: boolean }
  | { kind: "unauthenticated" | "forbidden" | "error" | "unavailable" };

export type DealColumn = Readonly<{
  stage: DealStage;
  label: string;
  tone: "neutral" | "warning" | "success";
  deals: readonly DealRecord[];
}>;

export type DealPipelineState =
  | { kind: "ready"; data: readonly DealColumn[]; hasDeals: boolean }
  | { kind: "loading" | "unauthenticated" | "forbidden" | "error" | "unavailable" | "empty" };

export function groupLeadsByStatus(leads: readonly LeadRecord[]): readonly PipelineColumn[] {
  const grouped = new Map<LeadLifecycleStatus, LeadRecord[]>(
    LEAD_LIFECYCLE_STATUSES.map((status) => [status, []]),
  );

  for (const lead of leads) {
    grouped.get(lead.status)?.push(lead);
  }

  return LEAD_LIFECYCLE_STATUSES.map((status) => ({
    status,
    label: formatLeadStatus(status),
    tone: leadStatusTone(status),
    leads: grouped.get(status) ?? [],
  }));
}

export function mapPipelineResult(result: LeadListResult): PipelineState {
  if (result.status !== "ready") {
    return { kind: result.status === "invalid_query" ? "error" : result.status };
  }

  return {
    kind: "ready",
    data: groupLeadsByStatus(result.data.items),
    hasLeads: result.data.items.length > 0,
    hasNextPage: result.data.next_cursor !== null,
  };
}

export function groupDealsByStage(deals: readonly DealRecord[]): readonly DealColumn[] {
  const grouped = new Map<DealStage, DealRecord[]>(
    LEAD_LIFECYCLE_STATUSES.map((stage) => [stage, []]),
  );

  for (const deal of deals) {
    grouped.get(deal.stage)?.push(deal);
  }

  return LEAD_LIFECYCLE_STATUSES.map((stage) => ({
    stage,
    label: formatLeadStatus(stage),
    tone: leadStatusTone(stage),
    deals: grouped.get(stage) ?? [],
  }));
}

export function mapDealPipelineResult(result: DealListResult): DealPipelineState {
  if (result.status !== "ready") {
    return { kind: result.status === "error" ? "error" : result.status };
  }

  return {
    kind: "ready",
    data: groupDealsByStage(result.data.items),
    hasDeals: result.data.items.length > 0,
  };
}

export function buildPipelineQuery(query: { q?: string; status?: LeadLifecycleStatus }): string {
  const params = new URLSearchParams({ limit: "50" });
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  return params.toString();
}

export function buildLeadDetailHref(leadId: string): string {
  return `/leads/${encodeURIComponent(leadId)}`;
}

export function buildDealDetailHref(dealId: string): string {
  return `/pipeline/${encodeURIComponent(dealId)}`;
}
