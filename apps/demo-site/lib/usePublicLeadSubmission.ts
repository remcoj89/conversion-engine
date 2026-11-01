"use client";

import { useRef, useState } from "react";
import type { FormStatus } from "../components/FormFields";
import {
  createPublicLeadSubmission,
  getPublicLeadErrorMessage,
  unavailableLeadIntakeClient,
  type PublicLeadFormData,
  type PublicLeadIntakeClient,
  type PublicLeadIntakeContext,
} from "./publicLeadIntake";

type SubmitValues = Readonly<{
  data: PublicLeadFormData;
  isValid: boolean;
}>;

export function usePublicLeadSubmission(
  client: PublicLeadIntakeClient = unavailableLeadIntakeClient,
  context: PublicLeadIntakeContext,
  onAccepted: () => void,
) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState<string | undefined>();
  const busy = useRef(false);

  async function submit({ data, isValid }: SubmitValues): Promise<void> {
    if (busy.current) return;
    if (!isValid) {
      setMessage(undefined);
      setStatus("invalid");
      return;
    }

    busy.current = true;
    setMessage(undefined);
    setStatus("submitting");

    try {
      const result = await client.submitLead(createPublicLeadSubmission(data, context));
      if (result.kind === "accepted") {
        setStatus("success");
        onAccepted();
      } else if (result.kind === "unavailable") {
        setMessage(result.reason === "not_configured" ? undefined : getPublicLeadErrorMessage(result.reason));
        setStatus("unavailable");
        busy.current = false;
      } else {
        setMessage(getPublicLeadErrorMessage(result.reason));
        setStatus("error");
        busy.current = false;
      }
    } catch {
      setMessage("Verzenden lukt nu even niet. Probeer het later opnieuw of plan direct een kennismaking.");
      setStatus("error");
      busy.current = false;
    }
  }

  return {
    status,
    message,
    submit,
    locked: status === "submitting" || status === "success",
  };
}
