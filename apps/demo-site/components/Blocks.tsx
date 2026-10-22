import type { Card, Faq } from "../content/types";

// Kleine, herbruikbare inhoudsblokken. Ze bevatten geen copy; alles komt uit content/demo.ts.

export function CardGrid({ cards }: Readonly<{ cards: readonly Card[] }>) {
  return (
    <ul className="card-grid">
      {cards.map((card) => (
        <li key={card.title} className="card">
          <h3>{card.title}</h3>
          <p>{card.text}</p>
        </li>
      ))}
    </ul>
  );
}

export function StepList({ steps }: Readonly<{ steps: readonly Card[] }>) {
  return (
    <ol className="steps">
      {steps.map((step) => (
        <li key={step.title} className="steps__item">
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function CheckList({ items, tone = "check" }: Readonly<{ items: readonly string[]; tone?: "check" | "cross" }>) {
  return (
    <ul className={`check-list check-list--${tone}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function FitColumns({
  forWho,
  notFor,
  forTitle = "Wel geschikt als…",
  notTitle = "Niet geschikt als…",
}: Readonly<{ forWho: readonly string[]; notFor: readonly string[]; forTitle?: string; notTitle?: string }>) {
  return (
    <div className="fit">
      <div className="fit__col">
        <h3>{forTitle}</h3>
        <CheckList items={forWho} />
      </div>
      <div className="fit__col fit__col--not">
        <h3>{notTitle}</h3>
        <CheckList items={notFor} tone="cross" />
      </div>
    </div>
  );
}

export function FactList({ items }: Readonly<{ items: readonly Card[] }>) {
  return (
    <dl className="facts">
      {items.map((item) => (
        <div key={item.title} className="facts__row">
          <dt>{item.title}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

// Native details/summary: toetsenbordbedienbaar zonder extra JavaScript.
export function FaqList({ items }: Readonly<{ items: readonly Faq[] }>) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details key={item.question} className="faq__item">
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

// Decoratieve visuele fallback in plaats van een foto; bewust geen externe afbeeldingen.
export function Visual({ variant = 0, label }: Readonly<{ variant?: number; label?: string }>) {
  return label ? (
    <div className={`visual visual--${variant % 4}`} role="img" aria-label={label} />
  ) : (
    <div className={`visual visual--${variant % 4}`} aria-hidden="true" />
  );
}
