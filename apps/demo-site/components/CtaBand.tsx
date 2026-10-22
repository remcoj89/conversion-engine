import type { Cta } from "../content/types";
import { CtaButton } from "./CtaButton";
import { headingId } from "./Section";

type Props = Readonly<{ title: string; text?: string; cta: Cta; secondary?: Cta }>;

// CTA-blok: herhaalt één primaire actie, met hooguit één rustige tweede route (GE-04).
export function CtaBand({ title, text, cta, secondary }: Props) {
  const id = headingId(title);
  return (
    <section className="section section--brand cta-band" aria-labelledby={id}>
      <div className="container container--narrow cta-band__inner">
        <h2 id={id}>{title}</h2>
        {text ? <p className="lead">{text}</p> : null}
        <div className="cta-row">
          <CtaButton cta={cta} />
          {secondary ? <CtaButton cta={secondary} variant="text" /> : null}
        </div>
      </div>
    </section>
  );
}
