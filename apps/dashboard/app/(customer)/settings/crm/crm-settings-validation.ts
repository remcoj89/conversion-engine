import type { CrmSettingsResponse } from "../../../../lib/bff/crmSettings";

export type CrmSettingsField =
  | "timezone"
  | "workingStart"
  | "workingEnd"
  | "deadlineBusinessDays"
  | "leadSources";

export type CrmSettingsValidationErrors = Readonly<Partial<Record<CrmSettingsField, string>>>;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)+)$/;

export function validateCrmSettings(settings: CrmSettingsResponse): CrmSettingsValidationErrors {
  const errors: Partial<Record<CrmSettingsField, string>> = {};
  const timezone = settings.timezone.trim();

  if (!TIMEZONE_PATTERN.test(timezone) || !isSupportedTimeZone(timezone)) {
    errors.timezone = "Vul een geldige IANA-tijdzone in, bijvoorbeeld Europe/Amsterdam.";
  }

  if (!TIME_PATTERN.test(settings.workingHours.start)) {
    errors.workingStart = "Gebruik het formaat UU:MM.";
  }

  if (!TIME_PATTERN.test(settings.workingHours.end)) {
    errors.workingEnd = "Gebruik het formaat UU:MM.";
  }

  if (
    TIME_PATTERN.test(settings.workingHours.start)
    && TIME_PATTERN.test(settings.workingHours.end)
    && settings.workingHours.end <= settings.workingHours.start
  ) {
    errors.workingEnd = "Het einde van de werkdag moet na de start liggen.";
  }

  if (
    !Number.isInteger(settings.leadFollowUp.deadlineBusinessDays)
    || settings.leadFollowUp.deadlineBusinessDays < 1
    || settings.leadFollowUp.deadlineBusinessDays > 30
  ) {
    errors.deadlineBusinessDays = "Kies een aantal werkdagen tussen 1 en 30.";
  }

  if (!settings.leadSources.some((source) => source.enabled)) {
    errors.leadSources = "Schakel minimaal één leadbron in.";
  }

  return errors;
}

function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
