import type { Metadata } from "next";
import { privacy, pageSeo } from "../../content/demo";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.privacy);

// Minimale privacypagina, nodig voor de verplichte privacyverwijzing in footer en formulieren (GE-07, GE-12).
export default function PrivacyPage() {
  return (
    <section className="section">
      <div className="container container--narrow prose">
        <h1>{privacy.title}</h1>
        {privacy.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
