export const CRM_WORKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

export type CrmWeekday = (typeof CRM_WORKDAYS)[number];

export type LeadAssignmentStrategy = "owner" | "manual" | "round_robin";

export interface CrmNotificationSettings {
  readonly inApp: boolean;
  readonly email: boolean;
}

export interface CrmWorkingHours {
  readonly start: string;
  readonly end: string;
}

export interface CrmLeadFollowUpSettings {
  readonly enabled: boolean;
  readonly deadlineBusinessDays: number;
  readonly assignmentStrategy: LeadAssignmentStrategy;
  readonly notifications: CrmNotificationSettings;
}

/**
 * Source IDs are stable. Renaming or disabling a source must not rewrite
 * historical lead data that refers to the source ID.
 */
export interface CrmLeadSource {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
}

export interface CrmSettings {
  readonly timezone: string;
  readonly workingDays: readonly CrmWeekday[];
  readonly workingHours: CrmWorkingHours;
  readonly leadFollowUp: CrmLeadFollowUpSettings;
  readonly leadSources: readonly CrmLeadSource[];
}

export const DEFAULT_CRM_SETTINGS = {
  timezone: "Europe/Amsterdam",
  workingDays: CRM_WORKDAYS,
  workingHours: {
    start: "09:00",
    end: "17:00",
  },
  leadFollowUp: {
    enabled: true,
    deadlineBusinessDays: 1,
    assignmentStrategy: "owner",
    notifications: {
      inApp: true,
      email: true,
    },
  },
  leadSources: [
    { id: "website", label: "Website", enabled: true },
    { id: "linkedin", label: "LinkedIn", enabled: true },
    { id: "social_media", label: "Andere social media", enabled: true },
    { id: "email", label: "E-mail", enabled: true },
    { id: "phone", label: "Telefoon", enabled: true },
    { id: "referral", label: "Referral", enabled: true },
    { id: "advertisement", label: "Advertentie", enabled: true },
    { id: "manual", label: "Handmatig toegevoegd", enabled: true },
    { id: "csv_import", label: "CSV-import", enabled: true },
    { id: "unknown", label: "Onbekend", enabled: true },
  ],
} as const satisfies CrmSettings;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)+)$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ASSIGNMENT_STRATEGIES: readonly LeadAssignmentStrategy[] = [
  "owner",
  "manual",
  "round_robin",
];

type UnknownRecord = Record<string, unknown>;

export class CrmSettingsValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid CRM settings: ${issues.join("; ")}`);
    this.name = "CrmSettingsValidationError";
    this.issues = issues;
  }
}

/**
 * Parse a JSON-like settings value and apply defaults only to omitted fields.
 * Invalid or unknown values are rejected instead of silently corrected.
 */
export function parseCrmSettings(input: unknown = {}): CrmSettings {
  const root = asRecord(input, "settings");
  assertKnownKeys(root, [
    "timezone",
    "workingDays",
    "workingHours",
    "leadFollowUp",
    "leadSources",
  ], "settings");

  const workingHours = parseWorkingHours(root.workingHours);
  const leadFollowUp = parseLeadFollowUp(root.leadFollowUp);
  const settings: CrmSettings = {
    timezone: readString(root, "timezone", DEFAULT_CRM_SETTINGS.timezone),
    workingDays: parseWorkingDays(root.workingDays),
    workingHours,
    leadFollowUp,
    leadSources: parseLeadSources(root.leadSources),
  };

  validateCrmSettings(settings);
  return settings;
}

export function createDefaultCrmSettings(): CrmSettings {
  return parseCrmSettings(DEFAULT_CRM_SETTINGS);
}

function validateCrmSettings(settings: CrmSettings): void {
  const issues: string[] = [];

  if (!TIMEZONE_PATTERN.test(settings.timezone) || !isSupportedTimeZone(settings.timezone)) {
    issues.push("timezone must be a valid IANA timezone");
  }

  if (!hasCanonicalWorkdays(settings.workingDays)) {
    issues.push("workingDays must be Monday through Friday in canonical order");
  }

  if (!TIME_PATTERN.test(settings.workingHours.start)) {
    issues.push("workingHours.start must use HH:mm");
  }
  if (!TIME_PATTERN.test(settings.workingHours.end)) {
    issues.push("workingHours.end must use HH:mm");
  }
  if (
    TIME_PATTERN.test(settings.workingHours.start)
    && TIME_PATTERN.test(settings.workingHours.end)
    && toMinutes(settings.workingHours.end) <= toMinutes(settings.workingHours.start)
  ) {
    issues.push("workingHours.end must be later than workingHours.start");
  }

  if (!Number.isInteger(settings.leadFollowUp.deadlineBusinessDays)
    || settings.leadFollowUp.deadlineBusinessDays < 1
    || settings.leadFollowUp.deadlineBusinessDays > 30) {
    issues.push("leadFollowUp.deadlineBusinessDays must be an integer from 1 to 30");
  }
  if (!ASSIGNMENT_STRATEGIES.includes(settings.leadFollowUp.assignmentStrategy)) {
    issues.push("leadFollowUp.assignmentStrategy is invalid");
  }

  if (settings.leadSources.length === 0) {
    issues.push("leadSources must contain at least one source");
  }
  if (!settings.leadSources.some((source) => source.enabled)) {
    issues.push("leadSources must contain at least one enabled source");
  }

  const sourceIds = new Set<string>();
  const sourceLabels = new Set<string>();
  for (const source of settings.leadSources) {
    if (!SOURCE_ID_PATTERN.test(source.id) || source.id.length > 64) {
      issues.push(`lead source id '${source.id}' must be a lowercase stable ID`);
    }
    if (source.label.trim() !== source.label || source.label.length === 0 || source.label.length > 80) {
      issues.push(`lead source '${source.id}' must have a non-empty label of at most 80 characters`);
    }
    if (sourceIds.has(source.id)) {
      issues.push(`lead source id '${source.id}' must be unique`);
    }
    if (sourceLabels.has(source.label.toLocaleLowerCase())) {
      issues.push(`lead source label '${source.label}' must be unique`);
    }
    sourceIds.add(source.id);
    sourceLabels.add(source.label.toLocaleLowerCase());
  }

  if (issues.length > 0) {
    throw new CrmSettingsValidationError(issues);
  }
}

function parseWorkingDays(value: unknown): readonly CrmWeekday[] {
  if (value === undefined) return [...CRM_WORKDAYS];
  if (!Array.isArray(value)) throw new CrmSettingsValidationError(["workingDays must be an array"]);
  return value.map((day, index) => {
    if (typeof day !== "string" || day !== CRM_WORKDAYS[index]) {
      throw new CrmSettingsValidationError(["workingDays must be Monday through Friday in canonical order"]);
    }
    return day as CrmWeekday;
  });
}

function parseWorkingHours(value: unknown): CrmWorkingHours {
  const source = value === undefined ? {} : asRecord(value, "workingHours");
  assertKnownKeys(source, ["start", "end"], "workingHours");
  return {
    start: readString(source, "start", DEFAULT_CRM_SETTINGS.workingHours.start),
    end: readString(source, "end", DEFAULT_CRM_SETTINGS.workingHours.end),
  };
}

function parseLeadFollowUp(value: unknown): CrmLeadFollowUpSettings {
  const source = value === undefined ? {} : asRecord(value, "leadFollowUp");
  assertKnownKeys(source, ["enabled", "deadlineBusinessDays", "assignmentStrategy", "notifications"], "leadFollowUp");
  const notificationsValue = source.notifications === undefined ? {} : asRecord(source.notifications, "leadFollowUp.notifications");
  assertKnownKeys(notificationsValue, ["inApp", "email"], "leadFollowUp.notifications");

  return {
    enabled: readBoolean(source, "enabled", DEFAULT_CRM_SETTINGS.leadFollowUp.enabled),
    deadlineBusinessDays: readNumber(
      source,
      "deadlineBusinessDays",
      DEFAULT_CRM_SETTINGS.leadFollowUp.deadlineBusinessDays,
    ),
    assignmentStrategy: readAssignmentStrategy(
      source,
      "assignmentStrategy",
      DEFAULT_CRM_SETTINGS.leadFollowUp.assignmentStrategy,
    ),
    notifications: {
      inApp: readBoolean(
        notificationsValue,
        "inApp",
        DEFAULT_CRM_SETTINGS.leadFollowUp.notifications.inApp,
      ),
      email: readBoolean(
        notificationsValue,
        "email",
        DEFAULT_CRM_SETTINGS.leadFollowUp.notifications.email,
      ),
    },
  };
}

function parseLeadSources(value: unknown): readonly CrmLeadSource[] {
  if (value === undefined) return DEFAULT_CRM_SETTINGS.leadSources.map((source) => ({ ...source }));
  if (!Array.isArray(value)) throw new CrmSettingsValidationError(["leadSources must be an array"]);

  return value.map((source, index) => {
    const record = asRecord(source, `leadSources[${index}]`);
    assertKnownKeys(record, ["id", "label", "enabled"], `leadSources[${index}]`);
    return {
      id: readString(record, "id"),
      label: readString(record, "label"),
      enabled: readBoolean(record, "enabled"),
    };
  });
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CrmSettingsValidationError([`${path} must be an object`]);
  }
  return value as UnknownRecord;
}

function assertKnownKeys(record: UnknownRecord, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  const unknownKeys = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new CrmSettingsValidationError([`${path} contains unknown setting(s): ${unknownKeys.join(", ")}`]);
  }
}

function readString(record: UnknownRecord, key: string, defaultValue?: string): string {
  const value = record[key] === undefined ? defaultValue : record[key];
  if (typeof value !== "string") {
    throw new CrmSettingsValidationError([`${key} must be a string`]);
  }
  return value;
}

function readBoolean(record: UnknownRecord, key: string, defaultValue?: boolean): boolean {
  const value = record[key] === undefined ? defaultValue : record[key];
  if (typeof value !== "boolean") {
    throw new CrmSettingsValidationError([`${key} must be a boolean`]);
  }
  return value;
}

function readNumber(record: UnknownRecord, key: string, defaultValue?: number): number {
  const value = record[key] === undefined ? defaultValue : record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CrmSettingsValidationError([`${key} must be a finite number`]);
  }
  return value;
}

function readAssignmentStrategy(
  record: UnknownRecord,
  key: string,
  defaultValue: LeadAssignmentStrategy,
): LeadAssignmentStrategy {
  const value = record[key] === undefined ? defaultValue : record[key];
  if (typeof value !== "string" || !ASSIGNMENT_STRATEGIES.includes(value as LeadAssignmentStrategy)) {
    throw new CrmSettingsValidationError([`${key} must be owner, manual or round_robin`]);
  }
  return value as LeadAssignmentStrategy;
}

function hasCanonicalWorkdays(value: readonly CrmWeekday[]): boolean {
  return value.length === CRM_WORKDAYS.length
    && value.every((day, index) => day === CRM_WORKDAYS[index]);
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
