type TodayResponse = {
  actionRequired: {
    id: string;
    label: string;
    value: number | null;
    status: "unavailable";
    source: string;
  }[];
  directFollowUp: {
    status: "empty";
    message: string;
  };
};

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

// Zelfde lege/onbeschikbare staat als de statische basis, voor als de API niet bereikbaar is.
const unavailableToday: TodayResponse = {
  actionRequired: [
    {
      id: "leads-needing-attention",
      label: "Leads die aandacht vragen",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "open-tasks",
      label: "Open taken",
      value: null,
      status: "unavailable",
      source: "CRM",
    },
    {
      id: "confirmed-appointments",
      label: "Bevestigde afspraken",
      value: null,
      status: "unavailable",
      source: "Boekingsprovider",
    },
  ],
  directFollowUp: {
    status: "empty",
    message:
      "Zodra de Conversion Engine API is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
  },
};

async function getToday(): Promise<TodayResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/dashboard/today`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return unavailableToday;
    }
    return (await response.json()) as TodayResponse;
  } catch {
    return unavailableToday;
  }
}

export default async function TodayPage() {
  const { actionRequired, directFollowUp } = await getToday();

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Conversion Engine</p>
        <h1>Vandaag</h1>
        <p className="intro">
          Bekijk hier de belangrijkste acties en opvolging.
        </p>
      </div>

      <section aria-labelledby="attention-title">
        <div className="section-heading">
          <h2 id="attention-title">Actie vereist</h2>
          <p>Pak de belangrijkste openstaande aanvragen en taken eerst op.</p>
        </div>
        <div className="card-grid">
          {actionRequired.map((card) => (
            <article key={card.id} className="card stat">
              <h3 className="stat-label">{card.label}</h3>
              <p className="stat-value">{card.value ?? "—"}</p>
              <p className="stat-meta">
                {card.status === "unavailable" && (
                  <span className="badge badge-neutral">Niet beschikbaar</span>
                )}{" "}
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
        {directFollowUp.status === "empty" && (
          <div className="card empty-state">
            <h3>Nog geen aanvragen</h3>
            <p>{directFollowUp.message}</p>
          </div>
        )}
      </section>
    </>
  );
}
