"use client";

import { useState } from "react";

type Props = Readonly<{ label: string; demoResult: string }>;

// Primaire afspraakactie (CP-03). In de demo is er geen externe afspraakprovider:
// de knop toont alleen waar die module in de klantversie opent.
export function AppointmentCta({ label, demoResult }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className="appointment">
      <button type="button" className="cta cta--primary" onClick={() => setShown(true)} aria-describedby={shown ? "appointment-result" : undefined}>
        {label}
      </button>
      <p id="appointment-result" className="form-alert form-alert--info" role="status" hidden={!shown}>
        {demoResult}
      </p>
    </div>
  );
}
