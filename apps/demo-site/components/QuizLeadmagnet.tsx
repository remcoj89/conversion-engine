"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { QuizConfig } from "../content/types";
import { scoreQuiz, type QuizAnswers } from "../lib/quiz";
import { saveQuizResult } from "../lib/quizResult";
import { useDemoSubmission } from "../lib/useDemoSubmission";
import { hasErrors, validateSummary, type SummaryField, type SummaryValues } from "../lib/validation";
import { CheckboxField, FormAlert, TextField } from "./FormFields";

type FormCopy = Readonly<{ title: string; text: string; submitLabel: string; skipLabel: string }>;

type Props = Readonly<{ quiz: QuizConfig; form: FormCopy }>;

const emptySummary: SummaryValues = { firstName: "", email: "", consent: false, marketing: false };

// Leadmagnet: Trainingsdoel-check (LM-06) met optionele samenvatting (LM-08).
// Het resultaat is direct zichtbaar zonder e-mailadres; er wordt niets verstuurd of opgeslagen buiten deze browser.
export function QuizLeadmagnet({ quiz, form }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [missingAnswer, setMissingAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);

  const total = quiz.questions.length;
  const question = quiz.questions[step];
  const profile = finished ? scoreQuiz(quiz, answers) : null;

  // Na elke stap de focus naar de nieuwe vraag of het resultaat, niet bij de eerste render.
  useEffect(() => {
    if (interacted.current) focusTarget.current?.focus();
  }, [step, finished]);

  function next() {
    interacted.current = true;
    if (!answers[question.id]) {
      setMissingAnswer(true);
      return;
    }
    setMissingAnswer(false);
    if (step + 1 < total) {
      setStep(step + 1);
      return;
    }
    const result = scoreQuiz(quiz, answers);
    if (result) {
      saveQuizResult({ profileId: result.id, summaryRequested: false });
      setFinished(true);
    }
  }

  function previous() {
    interacted.current = true;
    setMissingAnswer(false);
    setStep(Math.max(0, step - 1));
  }

  function restart() {
    interacted.current = true;
    setAnswers({});
    setStep(0);
    setFinished(false);
  }

  if (finished && profile) {
    return (
      <div className="quiz quiz--result">
        <div className="quiz__result" aria-live="polite">
          <p className="eyebrow">Jouw resultaat</p>
          <h3 ref={focusTarget} tabIndex={-1} className="quiz__result-title">
            {profile.title}
          </h3>
          <p>{profile.summary}</p>
          <dl className="facts facts--compact">
            <div className="facts__row">
              <dt>Passend weekritme</dt>
              <dd>{profile.rhythm}</dd>
            </div>
            <div className="facts__row">
              <dt>Je eerste stap</dt>
              <dd>{profile.firstAction}</dd>
            </div>
          </dl>
          <button type="button" className="cta cta--text" onClick={restart}>
            Doe de check opnieuw
          </button>
        </div>
        <SummaryForm
          form={form}
          onDone={(summaryRequested) => {
            saveQuizResult({ profileId: profile.id, summaryRequested });
            router.push("/bedankt?bron=leadmagnet");
          }}
        />
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz__progress">
        <p id="quiz-progress-label">
          Vraag {step + 1} van {total}
        </p>
        <div className="quiz__bar" aria-hidden="true">
          <span style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>
      <div className="quiz__question">
        <h3 ref={focusTarget} tabIndex={-1} id="quiz-question-title" className="quiz__title">
          {question.question}
        </h3>
        <div
          className="quiz__options"
          role="radiogroup"
          aria-labelledby="quiz-question-title"
          aria-describedby={missingAnswer ? "quiz-progress-label quiz-error" : "quiz-progress-label"}
          aria-required="true"
        >
          {question.options.map((option) => (
            <label key={option.id} className="quiz__option">
              <input
                type="radio"
                name={`quiz-${question.id}`}
                value={option.id}
                checked={answers[question.id] === option.id}
                onChange={() => {
                  setAnswers({ ...answers, [question.id]: option.id });
                  setMissingAnswer(false);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {missingAnswer ? (
          <p id="quiz-error" className="field__error" role="alert">
            Kies een antwoord om verder te gaan.
          </p>
        ) : null}
      </div>
      <div className="quiz__nav">
        <button type="button" className="cta cta--secondary" onClick={previous} disabled={step === 0}>
          Vorige
        </button>
        <button type="button" className="cta cta--primary" onClick={next}>
          {step + 1 < total ? "Volgende vraag" : "Bekijk mijn resultaat"}
        </button>
      </div>
    </div>
  );
}

function SummaryForm({ form, onDone }: Readonly<{ form: FormCopy; onDone: (summaryRequested: boolean) => void }>) {
  const [values, setValues] = useState<SummaryValues>(emptySummary);
  const [touched, setTouched] = useState<Partial<Record<SummaryField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const { status, submit, locked } = useDemoSubmission(() => onDone(true));

  const errors = validateSummary(values);
  const visible = (field: SummaryField) => (submitted || touched[field] ? errors[field] : undefined);
  const set = <K extends keyof SummaryValues>(field: K, value: SummaryValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));
  const blur = (field: SummaryField) => () => setTouched((current) => ({ ...current, [field]: true }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const valid = !hasErrors(errors);
    if (!valid) {
      const first = (Object.keys(errors) as SummaryField[])[0];
      document.getElementById(`summary-${first}`)?.focus();
    }
    await submit(values.email, valid);
  }

  const showInvalid = status === "invalid" && hasErrors(errors);

  return (
    <form className="form quiz__form" noValidate onSubmit={onSubmit} aria-labelledby="summary-title">
      <h3 id="summary-title">{form.title}</h3>
      <p>{form.text}</p>
      <fieldset disabled={locked} className="form__fields">
        <legend className="visually-hidden">{form.title}</legend>
        <TextField id="summary-firstName" label="Voornaam" required autoComplete="given-name" value={values.firstName} onChange={(v) => set("firstName", v)} onBlur={blur("firstName")} error={visible("firstName")} maxLength={50} />
        <TextField id="summary-email" label="E-mailadres" type="email" required autoComplete="email" value={values.email} onChange={(v) => set("email", v)} onBlur={blur("email")} error={visible("email")} hint="Demo-tip: een adres op @fout.test laat de foutstatus zien." />
        <CheckboxField id="summary-consent" required checked={values.consent} onChange={(v) => set("consent", v)} error={visible("consent")}>
          Stuur mij de samenvatting van mijn resultaat. Daarvoor gebruiken we alleen mijn voornaam en e-mailadres.
        </CheckboxField>
        <CheckboxField id="summary-marketing" checked={values.marketing} onChange={(v) => set("marketing", v)}>
          Ik ontvang ook graag af en toe trainingstips (optioneel; niet nodig voor de samenvatting).
        </CheckboxField>
      </fieldset>
      <p className="form__note">
        Je antwoorden worden niet meegestuurd. Lees de <Link href="/privacy">privacytekst</Link>.
      </p>
      <FormAlert
        status={showInvalid ? "invalid" : status === "invalid" ? "idle" : status}
        messages={{
          invalid: "Controleer de gemarkeerde velden. Je ingevulde gegevens zijn bewaard.",
          submitting: "Bezig met verzenden…",
          success: "Gelukt! Je wordt doorgestuurd.",
          unavailable: "Verzenden lukt nu even niet. Je resultaat blijft hierboven staan; probeer het later opnieuw.",
        }}
      />
      <div className="cta-row">
        <button type="submit" className="cta cta--primary" disabled={locked}>
          {status === "submitting" ? "Bezig met verzenden…" : form.submitLabel}
        </button>
        <button type="button" className="cta cta--text" disabled={locked} onClick={() => onDone(false)}>
          {form.skipLabel}
        </button>
      </div>
    </form>
  );
}
