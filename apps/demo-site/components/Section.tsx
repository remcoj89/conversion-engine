import type { ReactNode } from "react";
import type { SectionIntro } from "../content/types";

type SectionProps = Readonly<{
  id?: string;
  tone?: "default" | "muted" | "brand";
  width?: "default" | "narrow";
  intro?: SectionIntro;
  headingLevel?: 1 | 2;
  children?: ReactNode;
}>;

// Stabiel id op basis van de koptekst, zodat server en browser hetzelfde renderen.
export function headingId(title: string): string {
  return `h-${title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

// Vaste sectie-opbouw voor alle pagina's: consistente spacing, breedte en kopstructuur.
export function Section({ id, tone = "default", width = "default", intro, headingLevel = 2, children }: SectionProps) {
  const titleId = intro ? headingId(intro.title) : undefined;
  return (
    <section id={id} className={`section section--${tone}`} aria-labelledby={titleId}>
      <div className={width === "narrow" ? "container container--narrow" : "container"}>
        {intro ? <SectionHeading intro={intro} id={titleId} level={headingLevel} /> : null}
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({ intro, id, level = 2 }: Readonly<{ intro: SectionIntro; id?: string; level?: 1 | 2 }>) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="section-heading">
      {intro.eyebrow ? <p className="eyebrow">{intro.eyebrow}</p> : null}
      <Heading id={id ?? headingId(intro.title)}>{intro.title}</Heading>
      {intro.text ? <p className="lead">{intro.text}</p> : null}
    </div>
  );
}
