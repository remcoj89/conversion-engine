import type { Metadata } from "next";
import { ThankYou, type ThankYouSource } from "../../components/ThankYou";
import { pageSeo } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.thankYou);

type Props = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

// Bedankpagina: website-blokken-bedankpagina-upsell.md. De URL bevat alleen de bron, nooit persoonsgegevens.
export default async function ThankYouPage({ searchParams }: Props) {
  const { bron } = await searchParams;
  const source: ThankYouSource = bron === "contact" ? "contact" : "leadmagnet";
  return (
    <section className="section">
      <div className="container container--narrow thank-you">
        <ThankYou source={source} />
      </div>
    </section>
  );
}
