// Alleen voor tests in dashboard en API: een volledig en geldig ingevulde intake, afgeleid uit het schema.
import { clearHidden, type AnswerValue, type Answers } from "./engine.ts";
import { allFields, type FieldDefinition } from "./schema.ts";

// Een geldige waarde voor elk veldtype, binnen de grenzen van het schema.
export function validValue(field: FieldDefinition): AnswerValue | undefined {
  switch (field.type) {
    case "text":
    case "textarea": {
      const length = Math.min(Math.max(field.min ?? 3, 3), field.max ?? 100);
      return "x".repeat(length);
    }
    case "email":
      return "info@voorbeeld.nl";
    case "url":
      return "https://voorbeeld.nl";
    case "domain":
      return "voorbeeld.nl";
    case "number":
      return String(field.min ?? 1);
    case "money":
      return "149,00";
    case "single_choice":
      return field.choices![0]!.value;
    case "multi_choice":
      return field.choices!
        .filter((choice) => !field.exclusive?.includes(choice.value))
        .slice(0, Math.max(field.min_items ?? 1, 1))
        .map((choice) => choice.value);
    case "repeater":
    case "file":
      return undefined;
  }
}
// Alle velden geldig ingevuld; verborgen velden worden daarna door clearHidden verwijderd.
export function completeAnswers(): Answers {
  const answers: Record<string, AnswerValue> = {};
  for (const field of allFields) {
    const value = validValue(field);
    if (value !== undefined) answers[field.id] = value;
  }
  return clearHidden(answers);
}
