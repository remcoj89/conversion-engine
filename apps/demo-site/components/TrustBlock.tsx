import type { Testimonial } from "../content/types";

type Props = Readonly<{ testimonials: readonly Testimonial[]; note?: string; limit?: number }>;

// Testimonial-/trustblok. Voorbeeldreviews krijgen zichtbaar het label 'Voorbeeld',
// zodat de demo nooit als echte social proof kan worden gelezen.
export function TrustBlock({ testimonials, note, limit }: Props) {
  const shown = limit ? testimonials.slice(0, limit) : testimonials;
  return (
    <div className="trust">
      <ul className="trust__list">
        {shown.map((item) => (
          <li key={item.quote} className="trust__item">
            <figure>
              {item.isExample ? <span className="badge">Voorbeeld</span> : null}
              <blockquote>
                <p>{item.quote}</p>
              </blockquote>
              <figcaption>
                <strong>{item.name}</strong>
                <span>{item.context}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {note ? <p className="trust__note">{note}</p> : null}
    </div>
  );
}
