"use client";

import { useSyncExternalStore } from "react";
import { quiz, site, thankYou } from "../content/demo";
import { parseQuizResult, readQuizResultRaw } from "../lib/quizResult";
import { CtaButton } from "./CtaButton";
import { UpsellBlock } from "./UpsellBlock";

export type ThankYouSource = "leadmagnet" | "contact";

const subscribe = () => () => undefined;

// Bedankpagina (BP-01 t/m BP-03): eerst bevestiging en levering, daarna pas één vervolgstap.
export function ThankYou({ source }: Readonly<{ source: ThankYouSource }>) {
  // sessionStorage bestaat alleen in de browser; de server rendert de fallback zonder resultaat.
  const raw = useSyncExternalStore(subscribe, readQuizResultRaw, () => null);

  if (source === "contact") {
    const copy = thankYou.contact;
    return (
      <>
        <Confirmation eyebrow={copy.eyebrow} title={copy.title} text={copy.text} delivery={copy.delivery} />
        <section className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title">{copy.nextStep.title}</h2>
          <p>{copy.nextStep.text}</p>
          <div className="cta-row">
            <CtaButton cta={copy.nextStep.cta} />
          </div>
          <p className="upsell__alternative">
            <CtaButton cta={thankYou.alternative} variant="text" />
          </p>
        </section>
      </>
    );
  }

  const copy = thankYou.leadmagnet;
  const stored = parseQuizResult(raw);
  const profile = stored ? quiz.profiles.find((candidate) => candidate.id === stored.profileId) : undefined;

  return (
    <>
      <Confirmation
        eyebrow={copy.eyebrow}
        title={copy.title}
        text={profile ? copy.text : copy.missingResult}
        delivery={profile ? (stored?.summaryRequested ? copy.delivery : copy.deliveryWithoutSummary) : undefined}
      />
      {profile ? (
        <section className="result-card" aria-labelledby="result-title">
          <p className="eyebrow">Jouw resultaat</p>
          <h2 id="result-title">{profile.title}</h2>
          <p>{profile.summary}</p>
          <dl className="facts facts--compact">
            <div className="facts__row">
              <dt>Passend weekritme</dt>
              <dd>{profile.rhythm}</dd>
            </div>
            <div className="facts__row">
              <dt>Je eerste stap</dt>
              <dd>{profile.firstAction}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <p>
          <CtaButton cta={site.leadmagnetCta} variant="secondary" />
        </p>
      )}
      <UpsellBlock upsell={thankYou.upsell} alternative={thankYou.alternative} />
    </>
  );
}

function Confirmation({ eyebrow, title, text, delivery }: Readonly<{ eyebrow: string; title: string; text: string; delivery?: string }>) {
  return (
    <div className="confirmation">
      <span className="confirmation__icon" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
      {delivery ? <p className="confirmation__delivery">{delivery}</p> : null}
    </div>
  );
}
