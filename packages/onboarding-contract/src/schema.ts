// Getypeerde toegang tot het gecombineerde onboardingschema (Q1–Q4), gedeeld door dashboard en API.
// onboarding-schema.json is een exacte kopie van het normatieve
// docs/fase-3-gecombineerde-onboarding-ontwikkelpakket-v0.1/fase-3-gecombineerde-onboarding-schema-v0.1.json;
// apps/dashboard/lib/onboarding/onboarding.test.ts bewaakt dat beide gelijk blijven.
import rawSchema from "./onboarding-schema.json" with { type: "json" };

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "single_choice"
  | "multi_choice"
  | "repeater"
  | "money"
  | "url"
  | "file"
  | "domain"
  | "email";

export type Choice = Readonly<{ value: string; label: string }>;

// Voorwaarde uit het schema: precies één van de operatoren is aanwezig.
export type VisibilityRule = Readonly<{
  field: string;
  eq?: string;
  in?: readonly string[];
  includes?: string;
  includes_any?: readonly string[];
  nonempty?: boolean;
}>;

export type RepeaterItemField = Readonly<{
  id: string;
  question: string;
  type: "text" | "textarea";
  required: boolean;
  min?: number;
  max?: number;
}>;

export type FieldDefinition = Readonly<{
  id: string;
  question: string;
  type: FieldType;
  required: boolean;
  mapping: string;
  source_questionnaire: string;
  min?: number;
  max?: number;
  example?: string;
  note?: string;
  notes?: string;
  choices?: readonly Choice[];
  when?: VisibilityRule;
  min_items?: number;
  max_items?: number;
  exclusive?: readonly string[];
  item_fields?: readonly RepeaterItemField[];
  accept?: readonly string[];
  max_files?: number;
  max_mb?: number;
}>;

export type SectionDefinition = Readonly<{
  id: string;
  title: string;
  subtitle?: string;
  fields: readonly FieldDefinition[];
}>;

export type PhaseDefinition = Readonly<{
  form_id: string;
  title: string;
  label: string;
  index: number;
  version: string;
  sections: readonly SectionDefinition[];
}>;

export type SourceQuestionnaire = Readonly<{
  id: string;
  file: string;
  version: string;
  fields: number;
  required_declared: number;
}>;

export type OnboardingSchema = Readonly<{
  id: string;
  version: string;
  status: string;
  source_questionnaires: readonly SourceQuestionnaire[];
  phases: readonly PhaseDefinition[];
  states: readonly string[];
  review_rules: Readonly<Record<string, boolean>>;
  project_brief: Readonly<{ version: string; sections: readonly string[] }>;
}>;

export const onboardingSchema = rawSchema as unknown as OnboardingSchema;

// Eén lijst van alle 20 formulierschermen, in volgorde Q1.1 … Q4.5.
export type Step = Readonly<{
  index: number;
  phaseIndex: number;
  sectionIndex: number;
  phase: PhaseDefinition;
  section: SectionDefinition;
}>;

export const steps: readonly Step[] = onboardingSchema.phases.flatMap((phase, phaseIndex) =>
  phase.sections.map((section, sectionIndex) => ({ phaseIndex, sectionIndex, phase, section })),
).map((step, index) => ({ ...step, index }));

export const allFields: readonly FieldDefinition[] = onboardingSchema.phases.flatMap((phase) =>
  phase.sections.flatMap((section) => section.fields),
);

const fieldsById = new Map(allFields.map((field) => [field.id, field]));

export function fieldById(id: string): FieldDefinition {
  const field = fieldsById.get(id);
  if (!field) throw new Error(`Onbekend onboardingveld: ${id}`);
  return field;
}

// Q-nummer ("Q1") en versie van de bronvragenlijst van een veld.
export function sourceOf(field: FieldDefinition): SourceQuestionnaire {
  const source = onboardingSchema.source_questionnaires.find((candidate) => candidate.id === field.source_questionnaire);
  if (!source) throw new Error(`Onbekende bronvragenlijst: ${field.source_questionnaire}`);
  return source;
}
