import { isLeadLifecycleStatus, type LeadQuery } from "../../../lib/bff/leads";

export type SearchParamValue = string | string[] | undefined;
export type SearchParams = Record<string, SearchParamValue>;

export function parseLeadQuery(searchParams: SearchParams): LeadQuery {
  const q = firstValue(searchParams.q)?.trim();
  const status = firstValue(searchParams.status);
  const limit = firstValue(searchParams.limit);
  const cursor = firstValue(searchParams.cursor)?.trim();

  return {
    ...(q && q.length <= 100 ? { q } : {}),
    ...(status && isLeadLifecycleStatus(status) ? { status } : {}),
    ...(limit && /^(?:[1-9]|[1-4][0-9]|50)$/.test(limit) ? { limit } : { limit: "25" }),
    ...(cursor && cursor.length <= 512 ? { cursor } : {}),
  };
}

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
