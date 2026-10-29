import LiveLeadDetailPage from "./live-lead-detail-page";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveLeadDetailPage id={id} />;
}
