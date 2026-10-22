"use client";

import { useRef, useState } from "react";
import { submitDemo } from "./demoSubmit";
import type { FormStatus } from "../components/FormFields";

// Gedeelde submitflow voor alle demoformulieren. De ref blokkeert een tweede klik nog vóór
// React opnieuw rendert; na succes blijft het formulier dicht, zodat er nooit dubbel wordt verzonden.
export function useDemoSubmission(onSuccess: () => void) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const busy = useRef(false);

  async function submit(email: string, isValid: boolean): Promise<void> {
    if (busy.current) return;
    if (!isValid) {
      setStatus("invalid");
      return;
    }
    busy.current = true;
    setStatus("submitting");
    try {
      const result = await submitDemo(email);
      if (result === "ok") {
        setStatus("success");
        onSuccess();
        return; // busy blijft true: geen tweede inzending meer.
      }
      setStatus("unavailable");
    } catch {
      setStatus("unavailable");
    }
    busy.current = false;
  }

  return { status, submit, locked: status === "submitting" || status === "success" };
}
