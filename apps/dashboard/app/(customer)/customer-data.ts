export type LeadStatus = "action" | "appointment" | "human" | "new" | "done";

export type TimelineEvent = {
  at: string;
  title: string;
  detail: string;
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  company: string;
  source: string;
  interest: string;
  status: LeadStatus;
  owner: string;
  created: string;
  aiStatus: "sent" | "failed" | "none";
  marketingConsent: "Niet vastgesteld" | "Toestemming gegeven";
  timeline: readonly TimelineEvent[];
};

export const leads: readonly Lead[] = [
  {
    id: "lead-101",
    name: "Mark de Vries",
    email: "mark@example.test",
    company: "De Vries Personal Training",
    source: "Fitnessquiz",
    interest: "Personal training",
    status: "action",
    owner: "Eigenaar",
    created: "Vandaag, 09:18",
    aiStatus: "sent",
    marketingConsent: "Niet vastgesteld",
    timeline: [
      {
        at: "Vandaag, 09:18",
        title: "Aanvraag ontvangen",
        detail: "Websitequiz afgerond met interesse in personal training.",
      },
      {
        at: "Vandaag, 09:19",
        title: "AI-reactie verzonden",
        detail: "Vervolgvraag en boekingslink verstuurd.",
      },
    ],
  },
  {
    id: "lead-102",
    name: "Lisa Bakker",
    email: "lisa@example.test",
    company: "Lisa Bakker Coaching",
    source: "Contactformulier",
    interest: "Kennismaking",
    status: "appointment",
    owner: "Eigenaar",
    created: "Gisteren, 16:05",
    aiStatus: "sent",
    marketingConsent: "Toestemming gegeven",
    timeline: [
      {
        at: "Gisteren, 16:05",
        title: "Aanvraag ontvangen",
        detail: "Contactformulier ontvangen.",
      },
      {
        at: "Gisteren, 16:10",
        title: "Afspraak bevestigd",
        detail: "De boekingsprovider bevestigde woensdag om 15:00.",
      },
    ],
  },
  {
    id: "lead-103",
    name: "Sam Janssen",
    email: "sam@example.test",
    company: "Janssen Vitaliteit",
    source: "Calculator",
    interest: "Coaching",
    status: "human",
    owner: "Medewerker",
    created: "Vandaag, 10:42",
    aiStatus: "failed",
    marketingConsent: "Niet vastgesteld",
    timeline: [
      {
        at: "Vandaag, 10:42",
        title: "Aanvraag ontvangen",
        detail: "Calculatorresultaat: drie trainingsdagen per week.",
      },
      {
        at: "Vandaag, 10:43",
        title: "AI-reactie mislukt",
        detail: "Bericht niet verzonden; handmatige opvolging vereist.",
      },
    ],
  },
  {
    id: "lead-104",
    name: "Alex Smit",
    email: "alex@example.test",
    company: "Alex Smit Performance",
    source: "Download",
    interest: "Trainingsschema",
    status: "new",
    owner: "Medewerker",
    created: "Gisteren, 11:24",
    aiStatus: "none",
    marketingConsent: "Niet vastgesteld",
    timeline: [
      {
        at: "Gisteren, 11:24",
        title: "Gids aangevraagd",
        detail: "De gids is afgeleverd; verkoopintentie is nog niet vastgesteld.",
      },
    ],
  },
  {
    id: "lead-105",
    name: "Nora Visser",
    email: "nora@example.test",
    company: "Visser Mindset",
    source: "Websiteformulier",
    interest: "Strategische sessie",
    status: "done",
    owner: "Eigenaar",
    created: "Maandag, 14:12",
    aiStatus: "sent",
    marketingConsent: "Toestemming gegeven",
    timeline: [
      {
        at: "Maandag, 14:12",
        title: "Aanvraag ontvangen",
        detail: "Vraag naar een strategische sessie ontvangen.",
      },
      {
        at: "Dinsdag, 09:00",
        title: "Aanvraag afgehandeld",
        detail: "Eerste gesprek afgerond en opvolging vastgelegd.",
      },
    ],
  },
];

export const leadStatusLabels: Readonly<Record<LeadStatus, string>> = {
  action: "Actie nodig",
  appointment: "Afspraak gepland",
  human: "Handmatig behandelen",
  new: "Nieuw",
  done: "Afgehandeld",
};

export const leadStatusTones: Readonly<Record<LeadStatus, "warning" | "success" | "neutral">> = {
  action: "warning",
  appointment: "success",
  human: "warning",
  new: "neutral",
  done: "success",
};

export const pipelineStages = [
  "Nieuw",
  "Gekwalificeerd",
  "Afspraak",
  "Voorstel",
  "Gewonnen",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];

export type Deal = {
  id: string;
  leadId: string | null;
  name: string;
  stage: PipelineStage | "Verloren";
  value: number;
  received: number;
  owner: string;
  updated: string;
  nextStep: string;
};

export const deals: readonly Deal[] = [
  {
    id: "deal-201",
    leadId: "lead-101",
    name: "12 weken coaching — Mark",
    stage: "Nieuw",
    value: 900,
    received: 0,
    owner: "Eigenaar",
    updated: "Vandaag, 09:25",
    nextStep: "Bel Mark over trainingsdoelen",
  },
  {
    id: "deal-202",
    leadId: "lead-102",
    name: "Personal training — Lisa",
    stage: "Afspraak",
    value: 1200,
    received: 0,
    owner: "Eigenaar",
    updated: "Gisteren, 16:10",
    nextStep: "Bereid de intake voor",
  },
  {
    id: "deal-203",
    leadId: null,
    name: "Bootcamp — Robin",
    stage: "Voorstel",
    value: 450,
    received: 0,
    owner: "Medewerker",
    updated: "Dinsdag, 15:40",
    nextStep: "Voorstel nabellen",
  },
  {
    id: "deal-204",
    leadId: null,
    name: "Groepsles — Kim",
    stage: "Gewonnen",
    value: 600,
    received: 150,
    owner: "Eigenaar",
    updated: "Maandag, 11:20",
    nextStep: "Startdatum bevestigen",
  },
  {
    id: "deal-205",
    leadId: null,
    name: "Vitaliteitsprogramma — Noor",
    stage: "Gekwalificeerd",
    value: 2400,
    received: 0,
    owner: "Medewerker",
    updated: "Maandag, 10:05",
    nextStep: "Behoeftegesprek plannen",
  },
];

export type Task = {
  id: string;
  leadId: string | null;
  text: string;
  owner: string;
  date: string;
  done: boolean;
};

export const tasks: readonly Task[] = [
  {
    id: "task-301",
    leadId: "lead-101",
    text: "Bel Mark over trainingsdoelen",
    owner: "Eigenaar",
    date: "Vandaag",
    done: false,
  },
  {
    id: "task-302",
    leadId: "lead-103",
    text: "Neem Sam handmatig over: AI-verzending mislukt",
    owner: "Medewerker",
    date: "Vandaag",
    done: false,
  },
  {
    id: "task-303",
    leadId: "lead-102",
    text: "Bereid intake met Lisa voor",
    owner: "Eigenaar",
    date: "Morgen",
    done: false,
  },
  {
    id: "task-304",
    leadId: null,
    text: "Controleer de maandelijkse aanbevelingen",
    owner: "Eigenaar",
    date: "Vrijdag",
    done: true,
  },
];

export const appointments = [
  {
    id: "appointment-401",
    title: "Kennismaking Lisa Bakker",
    date: "Woensdag 15:00",
    dateTime: "2026-10-29T15:00:00+01:00",
    provider: "Bevestigd door de boekingsprovider",
    leadId: "lead-102",
  },
] as const;

export const resultMetrics = [
  { label: "Aanvragen", value: "38", detail: "CRM-gevalideerde leads" },
  { label: "Afspraken", value: "15", detail: "Door provider bevestigd" },
  { label: "Gewonnen deals", value: "7", detail: "In de gekozen periode" },
  { label: "Ontvangen betalingen", value: "€ 2.450", detail: "Handmatig geregistreerd" },
] as const;

export const resultMonths = [
  { month: "Augustus", leads: 31, appointments: 12, won: 5, revenue: "€ 1.800" },
  { month: "September", leads: 35, appointments: 14, won: 6, revenue: "€ 2.150" },
  { month: "Oktober", leads: 38, appointments: 15, won: 7, revenue: "€ 2.450" },
] as const;

export const performancePeriods = {
  "7": {
    label: "7 dagen",
    users: "624",
    clicks: "168",
    impressions: "3.460",
    ctr: "4,9%",
    events: "9",
    bars: [29, 43, 39, 53, 59, 68, 57],
  },
  "30": {
    label: "30 dagen",
    users: "2.486",
    clicks: "712",
    impressions: "15.148",
    ctr: "4,7%",
    events: "38",
    bars: [31, 42, 39, 54, 44, 61, 68, 58, 70, 79, 71, 92],
  },
  "90": {
    label: "90 dagen",
    users: "7.092",
    clicks: "2.048",
    impressions: "43.810",
    ctr: "4,7%",
    events: "112",
    bars: [29, 33, 40, 38, 45, 49, 50, 48, 54, 59, 64, 70],
  },
} as const;

export type PerformancePeriod = keyof typeof performancePeriods;

export const performanceVisitors = [
  { period: "Ma 20 okt", users: "358", sessions: "421", engagement: "62%" },
  { period: "Di 21 okt", users: "402", sessions: "476", engagement: "65%" },
  { period: "Wo 22 okt", users: "391", sessions: "449", engagement: "61%" },
  { period: "Do 23 okt", users: "425", sessions: "501", engagement: "67%" },
  { period: "Vr 24 okt", users: "382", sessions: "438", engagement: "59%" },
] as const;

export const performanceAcquisition = [
  { source: "Organisch zoeken", sessions: "1.124", share: "45%", conversion: "2,9%" },
  { source: "Direct verkeer", sessions: "612", share: "25%", conversion: "1,8%" },
  { source: "Social media", sessions: "403", share: "16%", conversion: "1,5%" },
  { source: "Verwijzingen", sessions: "347", share: "14%", conversion: "3,2%" },
] as const;

export const performanceRecordings = [
  {
    path: "/contact",
    sessions: "18 opnames",
    signal: "Herhaalde klikken bij het formulierlabel",
    status: "Onderzoeken",
  },
  {
    path: "/personal-training",
    sessions: "24 opnames",
    signal: "Rage clicks rond de primaire CTA",
    status: "Onderzoeken",
  },
] as const;

export const recommendations = [
  {
    title: "Schrijf een artikel over trainen met een druk gezinsleven",
    area: "SEO · Content",
    priority: "Hoog",
    evidence: "Search Console toont vertoningen op relevante vraagvarianten met weinig klikken.",
    action: "Laat een concept maken en controleer de inhoud voordat Westend publiceert.",
    sources: "Search Console + DataForSEO",
  },
  {
    title: "Test een duidelijkere meta title voor de homepage",
    area: "SEO · Snippet",
    priority: "Hoog",
    evidence: "De homepage krijgt vertoningen, maar de voorbeeld-CTR blijft achter bij andere querygroepen.",
    action: "Maak een voorstel en volg het effect meerdere weken na akkoord.",
    sources: "Search Console",
  },
  {
    title: "Onderzoek wrijving rond het intakeformulier",
    area: "CRO · Formulier",
    priority: "Middel",
    evidence: "Clarity laat in de demo herhaalde klikken en dead clicks bij formulieronderdelen zien.",
    action: "Bekijk privacyveilige opnames en formuleer één kleine testbare verbetering.",
    sources: "Microsoft Clarity",
  },
  {
    title: "Versterk antwoorden op specifieke fitnessvragen",
    area: "GEO · AI-zichtbaarheid",
    priority: "Verkennen",
    evidence: "Een steekproef van DataForSEO toont onderwerpen waarop concurrenten terugkomen.",
    action: "Controleer bestaande pagina’s en voeg alleen nuttige expertinformatie toe.",
    sources: "DataForSEO AI Optimization",
  },
] as const;

export const supportRequests = [
  {
    id: "support-501",
    subject: "Vraag over de nieuwe intakepagina",
    status: "In behandeling",
    updated: "Vandaag, 11:32",
  },
  {
    id: "support-502",
    subject: "Boekingslink gecontroleerd",
    status: "Afgerond",
    updated: "Maandag, 14:10",
  },
] as const;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}
