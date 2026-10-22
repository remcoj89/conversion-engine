import assert from "node:assert/strict";
import test from "node:test";
import { quiz } from "../content/demo";
import type { QuizConfig } from "../content/types";
import { scoreQuiz, validateQuizConfig } from "./quiz";

const answersFor = (choice: (optionIds: string[]) => string) =>
  Object.fromEntries(quiz.questions.map((question) => [question.id, choice(question.options.map((option) => option.id))]));

test("de demo-quizconfiguratie is geldig", () => {
  assert.deepEqual(validateQuizConfig(quiz), []);
});

test("elk profiel is bereikbaar met een geldige antwoordcombinatie", () => {
  const reached = new Set<string>();
  const walk = (index: number, answers: Record<string, string>) => {
    if (index === quiz.questions.length) {
      const profile = scoreQuiz(quiz, answers);
      assert.ok(profile);
      reached.add(profile.id);
      return;
    }
    const question = quiz.questions[index];
    for (const option of question.options) {
      walk(index + 1, { ...answers, [question.id]: option.id });
    }
  };
  walk(0, {});
  assert.deepEqual([...reached].sort(), quiz.profiles.map((profile) => profile.id).sort());
});

test("resultaat is deterministisch", () => {
  const answers = answersFor((ids) => ids[1]);
  const first = scoreQuiz(quiz, answers);
  for (let i = 0; i < 5; i++) {
    assert.equal(scoreQuiz(quiz, answers)?.id, first?.id);
  }
});

test("bekende antwoordcombinaties geven het verwachte profiel", () => {
  assert.equal(scoreQuiz(quiz, answersFor((ids) => ids[0]))?.id, "rustig-opbouwen");
  assert.equal(
    scoreQuiz(quiz, { doel: "sterker", tijd: "ruim", ervaring: "regelmatig", struikelblok: "starten", plek: "gym" })?.id,
    "kracht-en-structuur",
  );
  assert.equal(
    scoreQuiz(quiz, { doel: "volhouden", tijd: "gemiddeld", ervaring: "vroeger", struikelblok: "drukte", plek: "thuis" })?.id,
    "ritme-terugvinden",
  );
});

test("onvolledige of onbekende antwoorden geven geen resultaat", () => {
  const complete = answersFor((ids) => ids[0]);
  const { doel: _skipped, ...incomplete } = complete;
  void _skipped;
  assert.equal(scoreQuiz(quiz, incomplete), null);
  assert.equal(scoreQuiz(quiz, { ...complete, tijd: "bestaat-niet" }), null);
});

test("gelijkspel wordt beslist door de volgorde van de profielen", () => {
  const tie: QuizConfig = {
    version: "test",
    name: "test",
    profiles: [
      { id: "a", title: "A", summary: "", rhythm: "", firstAction: "" },
      { id: "b", title: "B", summary: "", rhythm: "", firstAction: "" },
      { id: "c", title: "C", summary: "", rhythm: "", firstAction: "" },
    ],
    questions: [{ id: "q", question: "?", options: [{ id: "x", label: "x", scores: { b: 1, a: 1 } }, { id: "y", label: "y", scores: {} }] }],
  };
  assert.equal(scoreQuiz(tie, { q: "x" })?.id, "a");
});

test("ongeldige configuraties worden gedetecteerd", () => {
  const broken: QuizConfig = {
    ...quiz,
    profiles: quiz.profiles.slice(0, 2),
    questions: [
      ...quiz.questions,
      { id: "doel", question: "dubbel", options: [{ id: "x", label: "x", scores: { onbekend: 1 } }] },
    ],
  };
  const problems = validateQuizConfig(broken);
  assert.ok(problems.some((problem) => problem.includes("één tot vijf vragen")));
  assert.ok(problems.some((problem) => problem.includes("drie tot vier")));
  assert.ok(problems.some((problem) => problem.includes("dubbel")));
  assert.ok(problems.some((problem) => problem.includes("onbekend profiel")));
  assert.ok(problems.some((problem) => problem.includes("minder dan twee opties")));
});
