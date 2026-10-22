// Het quizresultaat gaat niet via de URL (BP §7): alleen het profiel-id en of er een samenvatting
// is aangevraagd staan tijdelijk in sessionStorage van deze browser. Geen naam, e-mail of antwoorden.
const KEY = "ce-demo:quiz-result";

export type StoredQuizResult = Readonly<{ profileId: string; summaryRequested: boolean }>;

export function saveQuizResult(result: StoredQuizResult): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // Opslag geblokkeerd (bijv. privémodus): de bedankpagina toont dan een nette fallback.
  }
}

// Ruwe string, zodat useSyncExternalStore een stabiele snapshot krijgt.
export function readQuizResultRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseQuizResult(raw: string | null): StoredQuizResult | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).profileId === "string" &&
      typeof (value as Record<string, unknown>).summaryRequested === "boolean"
    ) {
      return value as StoredQuizResult;
    }
  } catch {
    // Ongeldige waarde: behandelen als geen resultaat.
  }
  return null;
}
