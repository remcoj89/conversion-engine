import type { Cta, Upsell } from "../content/types";
import { CheckList } from "./Blocks";
import { CtaButton } from "./CtaButton";

type Props = Readonly<{ upsell: Upsell; alternative: Cta }>;

// Upsell (BP-04 t/m BP-08): één configureerbaar aanbod met één primaire CTA en een rustig alternatief.
export function UpsellBlock({ upsell, alternative }: Props) {
  return (
    <section className="upsell" aria-labelledby="upsell-title">
      <p className="upsell__transition">{upsell.transition}</p>
      <div className="upsell__card">
        <div className="upsell__main">
          <p className="eyebrow">Jouw volgende stap</p>
          <h2 id="upsell-title">{upsell.title}</h2>
          <p className="lead">{upsell.outcome}</p>
          <p>{upsell.forWho}</p>
          <CheckList items={upsell.included} />
        </div>
        <dl className="facts upsell__facts">
          <div className="facts__row">
            <dt>Tijd</dt>
            <dd>{upsell.timeInvestment}</dd>
          </div>
          <div className="facts__row">
            <dt>Prijs</dt>
            <dd>{upsell.price}</dd>
          </div>
          <div className="facts__row">
            <dt>Zekerheid</dt>
            <dd>{upsell.riskReversal}</dd>
          </div>
        </dl>
        <div className="cta-row">
          <CtaButton cta={upsell.cta} />
        </div>
      </div>
      <p className="upsell__alternative">
        <CtaButton cta={alternative} variant="text" />
      </p>
    </section>
  );
}
