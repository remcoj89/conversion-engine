import { parseLeadQuery, type SearchParams } from "./lead-query";
import LiveLeadsPage from "./live-leads-page";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  return <LiveLeadsPage query={parseLeadQuery(params)} />;
}
