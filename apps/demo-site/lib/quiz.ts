import type { QuizConfig, QuizProfile } from "../content/types";

// Antwoorden per vraag-id: het gekozen optie-id.
export type QuizAnswers = Readonly<Record<string, string>>;

// Deterministisch: dezelfde configuratie en antwoorden geven altijd hetzelfde profiel.
// Bij gelijke score wint het profiel dat eerder in `config.profiles` staat.
// Geeft null zolang niet alle vragen een geldig antwoord hebben.
export function scoreQuiz(config: QuizConfig, answers: QuizAnswers): QuizProfile | null {
  const totals = new Map(config.profiles.map((profile) => [profile.id, 0]));

  for (const question of config.questions) {
    const option = question.options.find((candidate) => candidate.id === answers[question.id]);
    if (!option) {
      return null;
    }
    for (const [profileId, score] of Object.entries(option.scores)) {
      totals.set(profileId, (totals.get(profileId) ?? 0) + score);
    }
  }

  let best: QuizProfile | null = null;
  let bestScore = -Infinity;
  for (const profile of config.profiles) {
    const score = totals.get(profile.id) ?? 0;
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

// Een ongeldige configuratie blokkeert publicatie (LM-spec §4); de tests draaien deze controle.
export function validateQuizConfig(config: QuizConfig): string[] {
  const problems: string[] = [];
  const profileIds = new Set(config.profiles.map((profile) => profile.id));

  if (config.questions.length < 1 || config.questions.length > 5) {
    problems.push("de pilot ondersteunt één tot vijf vragen");
  }
  if (config.profiles.length < 3 || config.profiles.length > 4) {
    problems.push("de pilot ondersteunt drie tot vier resultaatprofielen");
  }
  if (profileIds.size !== config.profiles.length) {
    problems.push("profiel-id's moeten uniek zijn");
  }

  const questionIds = new Set<string>();
  for (const question of config.questions) {
    if (questionIds.has(question.id)) {
      problems.push(`vraag-id ${question.id} komt dubbel voor`);
    }
    questionIds.add(question.id);
    if (question.options.length < 2) {
      problems.push(`vraag ${question.id} heeft minder dan twee opties`);
    }
    const optionIds = new Set<string>();
    for (const option of question.options) {
      if (optionIds.has(option.id)) {
        problems.push(`optie ${question.id}/${option.id} komt dubbel voor`);
      }
      optionIds.add(option.id);
      for (const [profileId, score] of Object.entries(option.scores)) {
        if (!profileIds.has(profileId)) {
          problems.push(`optie ${question.id}/${option.id} verwijst naar onbekend profiel ${profileId}`);
        }
        if (!Number.isInteger(score) || score < 0) {
          problems.push(`optie ${question.id}/${option.id} heeft een ongeldige score`);
        }
      }
    }
  }
  return problems;
}
