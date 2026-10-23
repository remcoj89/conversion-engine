"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onboardingSchema, type Answers } from "../../../../packages/onboarding-contract/src/index";

// Server-side conceptopslag voor de onboarding via de BFF (/api/onboarding).
// De lokale antwoorden blijven altijd leidend in de UI: geen enkele fout of conflict wist ze stilzwijgend.

export type SyncPhase = "loading" | "ready" | "unauthenticated" | "unavailable";

export type SaveState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "saving" }>
  | Readonly<{ kind: "saved"; at: Date }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "invalid"; count: number }>
  | Readonly<{ kind: "conflict"; serverVersion: number }>
  | Readonly<{ kind: "blocked"; reason: "schema_mismatch" | "not_editable" }>;

const SAVE_DELAY_MS = 800;

type LoadedDraft = Readonly<{ version: number; answers: Answers; updated_at: string | null }>;
type LoadResult = Readonly<{ kind: "ok"; draft: LoadedDraft }> | Readonly<{ kind: "unauthenticated" | "unavailable" }>;

// Haalt het opgeslagen concept op zonder state te wijzigen.
async function fetchDraft(): Promise<LoadResult> {
  try {
    const response = await fetch("/api/onboarding", { cache: "no-store" });
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

export function useDraftSync(answers: Answers, hydrate: (answers: Answers) => void) {
  const [phase, setPhase] = useState<SyncPhase>("loading");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const versionRef = useRef(0);
  const syncedRef = useRef(stableKey({}));
  const answersRef = useRef(answers);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
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
      versionRef.current = result.draft.version;
      syncedRef.current = stableKey(result.draft.answers);
      blockedRef.current = false;
      hydrate(result.draft.answers);
      setSave(result.draft.updated_at ? { kind: "saved", at: new Date(result.draft.updated_at) } : { kind: "idle" });
      enterPhase("ready");
    },
    [enterPhase, hydrate],
  );

  const saveNow = useCallback(async () => {
    if (phaseRef.current !== "ready" || blockedRef.current) return;
    const sent = answersRef.current;
    const sentKey = stableKey(sent);
    if (sentKey === syncedRef.current) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setSave({ kind: "saving" });
    try {
      const response = await fetch("/api/onboarding", {
        method: "PUT",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_id: onboardingSchema.id,
          schema_version: onboardingSchema.version,
          base_version: versionRef.current,
          answers: sent,
        }),
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
      inFlightRef.current = false;
      if (pendingRef.current && !blockedRef.current) {
        pendingRef.current = false;
        void saveNowRef.current();
      }
    }
  }, [enterPhase]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  const reload = () => {
    enterPhase("loading");
    void fetchDraft().then(applyLoad);
  };

  // Eén keer laden bij openen; daarna hervat de flow met de opgeslagen antwoorden.
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
      void fetch("/api/onboarding", {
        method: "PUT",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_id: onboardingSchema.id,
          schema_version: onboardingSchema.version,
          base_version: versionRef.current,
          answers: answersRef.current,
        }),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return {
    phase,
    save,
    retry: () => (phaseRef.current === "ready" ? void saveNow() : reload()),
    // Conflict: eigen antwoorden bewaren bovenop de nieuwste serverversie.
    keepMine: () => {
      if (save.kind !== "conflict") return;
      versionRef.current = save.serverVersion;
      blockedRef.current = false;
      void saveNow();
    },
    // Conflict: de nieuwste serverversie laden; vervangt de lokale antwoorden pas na deze expliciete keuze.
    loadServerVersion: reload,
  };
}
