"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onboardingSchema, type Answers, type ReviewStatus } from "../../../../packages/onboarding-contract/src/index";

// Server-side conceptopslag en officiële indiening voor de onboarding via de BFF (/api/onboarding).
// De lokale antwoorden blijven altijd leidend in de UI: geen enkele fout of conflict wist ze stilzwijgend.

export type SyncPhase = "loading" | "ready" | "unauthenticated" | "unavailable";

export type SaveState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "saving" }>
  | Readonly<{ kind: "saved"; at: Date }>
  | Readonly<{ kind: "submitted"; at: Date | null }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "invalid"; count: number }>
  | Readonly<{ kind: "conflict"; serverVersion: number }>
  | Readonly<{ kind: "blocked"; reason: "schema_mismatch" | "not_editable" }>;

export type MissingAnswer = Readonly<{ field_id: string; questionnaire: string; step: number; message: string }>;

export type SubmitState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "submitting" }>
  | Readonly<{ kind: "submitted" }>
  | Readonly<{ kind: "incomplete"; missing: readonly MissingAnswer[] }>
  | Readonly<{ kind: "invalid"; count: number }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "not_editable" }>
  | Readonly<{ kind: "error" }>;

const SAVE_DELAY_MS = 800;
const ENDPOINT = "/api/onboarding";

type LoadedDraft = Readonly<{ status: string; version: number; answers: Answers; updated_at: string | null }>;
type LoadResult = Readonly<{ kind: "ok"; draft: LoadedDraft }> | Readonly<{ kind: "unauthenticated" | "unavailable" }>;

// Haalt het opgeslagen concept op zonder state te wijzigen.
async function fetchDraft(): Promise<LoadResult> {
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) return { kind: "unavailable" };
    return { kind: "ok", draft: (await response.json()) as LoadedDraft };
  } catch {
    return { kind: "unavailable" };
  }
}

// Volgorde-onafhankelijke vergelijking van antwoorden (de server kan sleutels anders ordenen).
function stableKey(answers: Answers): string {
  return JSON.stringify(Object.keys(answers).sort().map((key) => [key, answers[key]]));
}

const requestBody = (baseVersion: number, answers: Answers) =>
  JSON.stringify({ schema_id: onboardingSchema.id, schema_version: onboardingSchema.version, base_version: baseVersion, answers });

// Alles behalve "draft" (ingediend of verder in review) is voor de klant alleen-lezen.
const reviewStatusOf = (serverStatus: string): ReviewStatus => (serverStatus === "draft" ? "draft" : "submitted");

export function useDraftSync(
  answers: Answers,
  hydrate: (answers: Answers, reviewStatus: ReviewStatus) => void,
  onSubmitted: () => void,
) {
  const [phase, setPhase] = useState<SyncPhase>("loading");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const versionRef = useRef(0);
  const syncedRef = useRef(stableKey({}));
  const answersRef = useRef(answers);
  // De lopende PUT; indienen wacht hierop, zodat versie en antwoorden nooit door elkaar lopen.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);
  // Geen automatische opslag tijdens indienen, na indienen, bij een conflict of bij een blokkade.
  const blockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Voor een vervolgopslag na een lopende opslag, zonder dat saveNow zichzelf hoeft te kennen.
  const saveNowRef = useRef<() => Promise<void>>(async () => undefined);
  const phaseRef = useRef<SyncPhase>("loading");

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const enterPhase = useCallback((next: SyncPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Verwerkt het resultaat van fetchDraft; alleen hier wordt state gezet.
  const applyLoad = useCallback(
    (result: LoadResult) => {
      if (result.kind !== "ok") return enterPhase(result.kind);
      const { draft } = result;
      const reviewStatus = reviewStatusOf(draft.status);
      versionRef.current = draft.version;
      syncedRef.current = stableKey(draft.answers);
      blockedRef.current = reviewStatus === "submitted";
      hydrate(draft.answers, reviewStatus);
      const at = draft.updated_at ? new Date(draft.updated_at) : null;
      setSave(reviewStatus === "submitted" ? { kind: "submitted", at } : at ? { kind: "saved", at } : { kind: "idle" });
      setSubmit(reviewStatus === "submitted" ? { kind: "submitted" } : { kind: "idle" });
      enterPhase("ready");
    },
    [enterPhase, hydrate],
  );

  const saveNow = useCallback((): Promise<void> => {
    if (phaseRef.current !== "ready" || blockedRef.current) return Promise.resolve();
    const sent = answersRef.current;
    const sentKey = stableKey(sent);
    if (sentKey === syncedRef.current) return Promise.resolve();
    if (inFlightRef.current) {
      pendingRef.current = true;
      return inFlightRef.current;
    }
    setSave({ kind: "saving" });
    const request = (async () => {
      try {
        const response = await fetch(ENDPOINT, {
          method: "PUT",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: requestBody(versionRef.current, sent),
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok) {
          versionRef.current = Number(body.version);
          syncedRef.current = sentKey;
          setSave({ kind: "saved", at: new Date(String(body.updated_at)) });
        } else if (response.status === 401) {
          enterPhase("unauthenticated");
        } else if (response.status === 409 && body.error === "version_conflict") {
          blockedRef.current = true;
          setSave({ kind: "conflict", serverVersion: Number(body.current_version) });
        } else if (response.status === 409) {
          blockedRef.current = true;
          setSave({ kind: "blocked", reason: body.error === "schema_mismatch" ? "schema_mismatch" : "not_editable" });
        } else if (response.status === 400 && body.error === "invalid_answers") {
          setSave({ kind: "invalid", count: Array.isArray(body.issues) ? body.issues.length : 1 });
        } else {
          setSave({ kind: "error" });
        }
      } catch {
        setSave({ kind: "error" });
      } finally {
        inFlightRef.current = null;
        if (pendingRef.current && !blockedRef.current) {
          pendingRef.current = false;
          void saveNowRef.current();
        }
      }
    })();
    inFlightRef.current = request;
    return request;
  }, [enterPhase]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  // Officieel indienen. Stopt eerst de debounce, wacht een lopende PUT af en stuurt dan de nieuwste
  // lokale antwoorden mee in de submit zelf; zo kan geen autosave tussendoor de versie verschuiven.
  const submitNow = useCallback(async () => {
    if (phaseRef.current !== "ready" || blockedRef.current) return;
    blockedRef.current = true;
    pendingRef.current = false;
    clearTimeout(timerRef.current);
    setSubmit({ kind: "submitting" });
    if (inFlightRef.current) await inFlightRef.current;
    // Een lopende opslag kan intussen een conflict of blokkade hebben gemeld; dan niet indienen.
    if (phaseRef.current !== "ready") return setSubmit({ kind: "idle" });

    const sent = answersRef.current;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: requestBody(versionRef.current, sent),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok) {
        versionRef.current = Number(body.version);
        syncedRef.current = stableKey(sent);
        setSave({ kind: "submitted", at: new Date(String(body.updated_at)) });
        setSubmit({ kind: "submitted" });
        onSubmitted();
        return; // blijft geblokkeerd: geen automatische opslag meer
      }
      if (response.status === 401) {
        enterPhase("unauthenticated");
        setSubmit({ kind: "idle" });
      } else if (response.status === 409 && body.error === "version_conflict") {
        setSave({ kind: "conflict", serverVersion: Number(body.current_version) });
        setSubmit({ kind: "conflict" });
        return; // geblokkeerd tot de gebruiker het conflict oplost
      } else if (response.status === 409 && body.error === "not_editable") {
        setSave({ kind: "blocked", reason: "not_editable" });
        setSubmit({ kind: "not_editable" });
        return;
      } else if (response.status === 409) {
        setSave({ kind: "blocked", reason: "schema_mismatch" });
        setSubmit({ kind: "error" });
        return;
      } else if (response.status === 400 && body.error === "incomplete_answers") {
        setSubmit({ kind: "incomplete", missing: Array.isArray(body.missing) ? (body.missing as MissingAnswer[]) : [] });
      } else if (response.status === 400 && body.error === "invalid_answers") {
        setSubmit({ kind: "invalid", count: Array.isArray(body.issues) ? body.issues.length : 1 });
      } else {
        setSubmit({ kind: "error" });
      }
    } catch {
      setSubmit({ kind: "error" });
    }
    // Niet ingediend: het concept blijft gewoon bewerkbaar en wordt weer automatisch opgeslagen.
    blockedRef.current = false;
    void saveNowRef.current();
  }, [enterPhase, onSubmitted]);

  const reload = () => {
    enterPhase("loading");
    void fetchDraft().then(applyLoad);
  };

  // Eén keer laden bij openen; daarna hervat de flow met de opgeslagen antwoorden en status.
  useEffect(() => {
    let active = true;
    void fetchDraft().then((result) => {
      if (active) applyLoad(result);
    });
    return () => {
      active = false;
    };
  }, [applyLoad]);

  // Automatisch opslaan kort nadat de antwoorden stoppen met veranderen.
  useEffect(() => {
    if (phase !== "ready") return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [answers, phase, saveNow]);

  // Bij het verlaten van de pagina een openstaande wijziging nog meesturen.
  useEffect(() => {
    const flush = () => {
      if (phaseRef.current !== "ready" || blockedRef.current || inFlightRef.current) return;
      if (stableKey(answersRef.current) === syncedRef.current) return;
      void fetch(ENDPOINT, {
        method: "PUT",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: requestBody(versionRef.current, answersRef.current),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return {
    phase,
    save,
    submit,
    submitNow,
    retry: () => (phaseRef.current === "ready" ? void saveNow() : reload()),
    // Conflict: eigen antwoorden bewaren bovenop de nieuwste serverversie.
    keepMine: () => {
      if (save.kind !== "conflict") return;
      versionRef.current = save.serverVersion;
      blockedRef.current = false;
      setSubmit({ kind: "idle" });
      void saveNow();
    },
    // Conflict of blokkade: de nieuwste serverversie en status laden; vervangt lokale antwoorden pas na deze keuze.
    loadServerVersion: reload,
  };
}
