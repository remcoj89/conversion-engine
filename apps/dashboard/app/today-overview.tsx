"use client";

import { useEffect, useState } from "react";

type TodayResponse = {
  // Tenant uit de auth-context van de API; null zolang er geen (geldige) response is.
  tenant: {
    id: string;
    name: string;
    status: string;
  } | null;
  actionRequired: {
    id: string;
    label: string;
    value: number | null;
    status: "available" | "unavailable";
    source: string;
  }[];
  directFollowUp: {
    status: "empty";
    message: string;
  };
};

// Lege/onbeschikbare staat tijdens laden en bij fouten; dit is ook wat in de server-HTML staat.
const unavailableToday: TodayResponse = {
  tenant: null,
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
      "CRM- en leaddata zijn nog niet beschikbaar. Zodra die bron is gekoppeld, verschijnen hier de aanvragen die opvolging nodig hebben.",
  },
};

export default function TodayOverview() {
  const [today, setToday] = useState(unavailableToday);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/today", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TodayResponse | null) => {
        if (data) {
          setToday(data);
        }
        setLoading(false);
      })
      .catch(() => {
        // Afgebroken bij unmount: niets doen. Netwerkfout: de onbeschikbare staat tonen.
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const { tenant, actionRequired, directFollowUp } = today;

  return (
    <>
      <p className="tenant-context" aria-busy={loading}>
        Klantomgeving:{" "}
        <strong>{tenant ? tenant.name : loading ? "Laden…" : "Niet beschikbaar"}</strong>
        {tenant && (
          <span className="badge badge-neutral">
            {tenant.status === "active" ? "Actief" : tenant.status}
          </span>
        )}
      </p>

      <section aria-labelledby="attention-title">
        <div className="section-heading">
          <h2 id="attention-title">Actie vereist</h2>
          <p>Pak de belangrijkste openstaande aanvragen en taken eerst op.</p>
        </div>
        <div className="card-grid" aria-busy={loading}>
          {actionRequired.map((card) => (
            <article key={card.id} className="card stat">
              <h3 className="stat-label">{card.label}</h3>
              <p className="stat-value">
                {!loading && card.status === "available" && card.value !== null
                  ? card.value
                  : "—"}
              </p>
              <p className="stat-meta">
                {loading ? (
                  <span className="badge badge-neutral">Laden…</span>
                ) : (
                  card.status === "unavailable" && (
                    <span className="badge badge-neutral">Niet beschikbaar</span>
                  )
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
