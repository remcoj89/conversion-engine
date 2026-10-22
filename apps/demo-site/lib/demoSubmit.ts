// Gesimuleerde verwerking: er gaat niets naar een server of externe dienst.
// Een e-mailadres op @fout.test toont de status 'tijdelijk niet beschikbaar' (GE-10), zodat die te demonstreren is.
export type DemoSubmitResult = "ok" | "unavailable";

const DEMO_DELAY_MS = 900;
const FAILURE_DOMAIN = "@fout.test";

export async function submitDemo(email: string): Promise<DemoSubmitResult> {
  await new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));
  return email.trim().toLowerCase().endsWith(FAILURE_DOMAIN) ? "unavailable" : "ok";
}
