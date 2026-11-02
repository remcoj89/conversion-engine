// Turns a failure of a local maintenance CLI into a short, safe diagnosis.
//
// Only allowlisted, structurally validated fields are printed: the SQLSTATE, a database object
// name parsed from PostgreSQL's fixed "permission denied" wording, and a constraint name.
// Error messages themselves are never printed, because Drizzle and pg include the SQL text and
// parameter values (subjects, e-mail addresses) and connection errors can include URLs.

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const PERMISSION_DENIED_PATTERN = /^permission denied for (table|function|schema|sequence) ([a-z_][a-z0-9_]{0,62})$/;
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]);

// Fixed messages from our own database factories; they contain no URLs, roles' secrets or data.
const SAFE_OWN_MESSAGE_PREFIXES = [
  "Maintenance database identity check failed:",
  "MAINTENANCE_DATABASE_URL must",
] as const;

type PgErrorFields = {
  code?: string;
  constraint?: string;
  deniedObject?: string;
};

export type MaintenanceFailureDiagnosis = Readonly<{
  sqlState?: string;
  object?: string;
  cause: string;
  nextStep: string;
}>;

function readPgFields(error: unknown): PgErrorFields {
  // Drizzle wraps the pg error as `cause`; walk at most a few levels.
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") {
      const fields: PgErrorFields = { code: candidate.code };
      if (typeof candidate.constraint === "string" && IDENTIFIER_PATTERN.test(candidate.constraint)) {
        fields.constraint = candidate.constraint;
      }
      if (typeof candidate.message === "string") {
        const denied = PERMISSION_DENIED_PATTERN.exec(candidate.message);
        if (denied) fields.deniedObject = `${denied[1]} ${denied[2]}`;
      }
      return fields;
    }
    current = candidate.cause;
  }
  return {};
}

function safeOwnMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return SAFE_OWN_MESSAGE_PREFIXES.some((prefix) => error.message.startsWith(prefix)) ? error.message : undefined;
}

export function diagnoseMaintenanceFailure(error: unknown): MaintenanceFailureDiagnosis {
  const ownMessage = safeOwnMessage(error);
  if (ownMessage) {
    return {
      cause: ownMessage,
      nextStep: "Controleer dat MAINTENANCE_DATABASE_URL lokaal naar ce_maintenance en de verwachte database wijst.",
    };
  }

  const fields = readPgFields(error);
  const code = fields.code;
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return { cause: "PostgreSQL is niet bereikbaar.", nextStep: "Start de lokale PostgreSQL-server en probeer opnieuw." };
  }
  const sqlState = code && SQLSTATE_PATTERN.test(code) ? code : undefined;

  switch (sqlState) {
    case "42501":
      return {
        sqlState,
        object: fields.deniedObject,
        cause: fields.deniedObject
          ? "ce_maintenance mist een databaserecht of een RLS-policy staat deze actie niet toe."
          : "Een RLS-policy staat deze actie niet toe.",
        nextStep: "Pas lokaal de migraties toe en voer daarna de role-bootstrap opnieuw uit; voeg niet handmatig rechten toe.",
      };
    case "42P01":
    case "42883":
    case "42703":
      return {
        sqlState,
        cause: "Het databaseschema loopt achter op de code.",
        nextStep: "Pas lokaal de migraties toe (db:migrate) en voer daarna de role-bootstrap opnieuw uit.",
      };
    case "28P01":
    case "28000":
      return {
        sqlState,
        cause: "Inloggen als ce_maintenance is geweigerd.",
        nextStep: "Controleer dat het lokale ce_maintenance-wachtwoord in .env overeenkomt met de laatste role-bootstrap.",
      };
    case "3D000":
      return { sqlState, cause: "De lokale database bestaat niet.", nextStep: "Controleer de databasenaam in MAINTENANCE_DATABASE_URL." };
    case undefined:
      return {
        cause: "Onbekende fout zonder databasecode.",
        nextStep: "Controleer de lokale PostgreSQL-log; de fout wordt hier bewust niet volledig getoond.",
      };
    default:
      if (sqlState.startsWith("23")) {
        return {
          sqlState,
          object: fields.constraint ? `constraint ${fields.constraint}` : undefined,
          cause: "Een databaseregel (constraint) weigerde de wijziging.",
          nextStep: "Controleer de bestaande lokale gegevens voor deze gebruiker of tenant.",
        };
      }
      return {
        sqlState,
        cause: "Onverwachte databasefout.",
        nextStep: "Controleer de lokale PostgreSQL-log voor deze SQLSTATE.",
      };
  }
}

export function formatMaintenanceFailure(action: string, error: unknown): string {
  const diagnosis = diagnoseMaintenanceFailure(error);
  const details = [
    diagnosis.sqlState ? `SQLSTATE ${diagnosis.sqlState}` : undefined,
    diagnosis.object,
  ].filter((part): part is string => Boolean(part));

  return [
    `${action} mislukt; de transactie is teruggedraaid en er is niets gewijzigd.`,
    `Oorzaak: ${diagnosis.cause}${details.length > 0 ? ` (${details.join(", ")})` : ""}`,
    `Volgende stap: ${diagnosis.nextStep}`,
  ].join("\n");
}
