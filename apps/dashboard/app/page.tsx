const attentionCards = [
  { label: "Leads die aandacht vragen", source: "CRM" },
  { label: "Open taken", source: "CRM" },
  { label: "Bevestigde afspraken", source: "Boekingsprovider" },
];

export default function TodayPage() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Conversion Engine</p>
        <h1>Vandaag</h1>
        <p className="intro">
          Begin bij de aanvragen en acties die vandaag aandacht nodig hebben.
          Dit is de statische dashboardbasis; er zijn nog geen gegevens
          gekoppeld.
        </p>
      </div>

      <section aria-labelledby="attention-title">
        <div className="section-heading">
          <h2 id="attention-title">Actie vereist</h2>
          <p>Pak de belangrijkste openstaande aanvragen en taken eerst op.</p>
        </div>
        <div className="card-grid">
          {attentionCards.map((card) => (
            <article key={card.label} className="card stat">
              <h3 className="stat-label">{card.label}</h3>
              <p className="stat-value">—</p>
              <p className="stat-meta">
                <span className="badge badge-neutral">Niet beschikbaar</span>{" "}
                Bron: {card.source}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="follow-up-title">
        <div className="section-heading">
          <h2 id="follow-up-title">Direct opvolgen</h2>
          <p>Aanvragen gesorteerd op benodigde actie.</p>
        </div>
        <div className="card empty-state">
          <h3>Nog geen aanvragen</h3>
          <p>
            Zodra de Conversion Engine API is gekoppeld, verschijnen hier de
            aanvragen die opvolging nodig hebben.
          </p>
        </div>
      </section>
    </>
  );
}
