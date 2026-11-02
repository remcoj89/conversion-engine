import { parseLeadQuery, type SearchParams } from "../leads/lead-query";
import LivePipelinePage from "./live-pipeline-page";

export default async function PipelinePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  return <LivePipelinePage query={parseLeadQuery(params)} />;
}
