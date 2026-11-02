import LiveDealDetailPage from "./live-deal-detail-page";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveDealDetailPage id={id} />;
}
