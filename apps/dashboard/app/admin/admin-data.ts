import type { AdminTone } from "./admin-types";

export type AdminClient = {
  id: string;
  name: string;
  industry: string;
  owner: string;
  status: string;
  statusKey: "active" | "review" | "onboarding" | "monitoring";
  statusTone: AdminTone;
  onboarding: string;
  onboardingKey: "submitted" | "review-needed" | "in-progress" | "approved";
  onboardingProgress: string;
  website: string;
  websiteEnvironment: string;
  websiteGate: string;
  websiteVersion: string;
  websiteLastCheck: string;
  monitoringStatus: string;
  monitoringDetail: string;
  monitoringTone: AdminTone;
  service: string;
  updatedAt: string;
};

export type AdminAuditEvent = {
  id: string;
  time: string;
  actor: string;
  actorRole: string;
  tenant: string;
  client: string;
  version: string;
  action: string;
  reason: string;
  source: string;
  status: string;
};

export const adminClients: AdminClient[] = [
  {
    id: "northline",
    name: "Northline Fysio",
    industry: "Fysiotherapie",
    owner: "Sanne de Vries",
    status: "Actief",
    statusKey: "active",
    statusTone: "success",
    onboarding: "Goedgekeurd",
    onboardingKey: "approved",
    onboardingProgress: "4/4 vragenlijsten",
    website: "northline-fysio.nl",
    websiteEnvironment: "Live",
    websiteGate: "Gate B akkoord",
    websiteVersion: "v1.4",
    websiteLastCheck: "Vandaag, 08:55",
    monitoringStatus: "Gezond",
    monitoringDetail: "Laatste controle vandaag om 08:55",
    monitoringTone: "success",
    service: "Website + Conversion Engine",
    updatedAt: "Vandaag, 09:14",
  },
  {
    id: "studio-morgen",
    name: "Studio Morgen",
    industry: "Interieuradvies",
    owner: "Ruben Visser",
    status: "In review",
    statusKey: "review",
    statusTone: "warning",
    onboarding: "Aanvulling nodig",
    onboardingKey: "review-needed",
    onboardingProgress: "3/4 vragenlijsten",
    website: "studiomorgen.nl",
    websiteEnvironment: "Staging",
    websiteGate: "Wacht op aanvulling",
    websiteVersion: "v0.8",
    websiteLastCheck: "Gisteren, 16:42",
    monitoringStatus: "Wacht op productie",
    monitoringDetail: "Geen live-controle zolang staging niet vrijgegeven is",
    monitoringTone: "info",
    service: "Website + Conversion Engine",
    updatedAt: "Gisteren, 16:42",
  },
  {
    id: "ambachtelijk",
    name: "Ambachtelijk Vastgoed",
    industry: "Vastgoed",
    owner: "Mila Jansen",
    status: "Onboarding",
    statusKey: "onboarding",
    statusTone: "info",
    onboarding: "Q3 van 4",
    onboardingKey: "in-progress",
    onboardingProgress: "3/4 vragenlijsten",
    website: "ambachtelijkvastgoed.nl",
    websiteEnvironment: "Briefing",
    websiteGate: "Gate 1 geblokkeerd",
    websiteVersion: "—",
    websiteLastCheck: "Nog niet gestart",
    monitoringStatus: "Nog niet actief",
    monitoringDetail: "Monitoring start na staging en productie",
    monitoringTone: "neutral",
    service: "Website",
    updatedAt: "28 okt 2026, 11:08",
  },
  {
    id: "helder-groen",
    name: "Helder Groen",
    industry: "Hoveniersbedrijf",
    owner: "Daan Smit",
    status: "Monitoring",
    statusKey: "monitoring",
    statusTone: "success",
    onboarding: "Live",
    onboardingKey: "submitted",
    onboardingProgress: "4/4 vragenlijsten",
    website: "heldergroen.nl",
    websiteEnvironment: "Live",
    websiteGate: "Monitoring actief",
    websiteVersion: "v1.1",
    websiteLastCheck: "Vandaag, 08:26",
    monitoringStatus: "In onderzoek",
    monitoringDetail: "Leadformulier gaf tijdelijk een foutstatus terug",
    monitoringTone: "warning",
    service: "Website + Conversion Engine",
    updatedAt: "28 okt 2026, 08:31",
  },
];

export const adminOperations = [
  {
    title: "Project Brief wacht op review",
    detail: "Studio Morgen · versie 3 · aanvulling ontvangen",
    status: "Review nodig",
    tone: "warning" as AdminTone,
    href: "/admin/review#review-blokkades",
  },
  {
    title: "Monitoring-incident onderzocht",
    detail: "Helder Groen · formulier-endpoint · laatste controle 08:26",
    status: "In onderzoek",
    tone: "info" as AdminTone,
    href: "/admin/monitoring#incidenten",
  },
  {
    title: "Nieuwe onboarding ingediend",
    detail: "Ambachtelijk Vastgoed · Project Brief versie 2",
    status: "Nieuw",
    tone: "success" as AdminTone,
    href: "/admin/review#project-brief",
  },
];

export const adminReviewClients = [
  { name: "Studio Morgen", industry: "Interieuradvies", status: "Aanvulling nodig", tone: "warning" as AdminTone, progress: "3/4 vragenlijsten" },
  { name: "Ambachtelijk Vastgoed", industry: "Vastgoed", status: "Ingediend", tone: "info" as AdminTone, progress: "4/4 vragenlijsten" },
  { name: "Northline Fysio", industry: "Fysiotherapie", status: "Goedgekeurd", tone: "success" as AdminTone, progress: "4/4 vragenlijsten" },
];

export const adminAuditEvents: AdminAuditEvent[] = [
  {
    id: "evt-1042",
    time: "28 okt 2026 · 09:14",
    actor: "Sanne de Vries",
    actorRole: "Owner",
    tenant: "northline",
    client: "Northline Fysio",
    version: "v4",
    action: "Project Brief goedgekeurd",
    reason: "Alle intakeantwoorden en controlepunten afgerond",
    source: "Review Studio",
    status: "Immutable",
  },
  {
    id: "evt-1041",
    time: "27 okt 2026 · 16:42",
    actor: "Lotte Meijer",
    actorRole: "Reviewer",
    tenant: "studio-morgen",
    client: "Studio Morgen",
    version: "v3",
    action: "Aanvulling gevraagd",
    reason: "Claim over resultaat mist onderbouwing",
    source: "Review Studio",
    status: "Immutable",
  },
  {
    id: "evt-1040",
    time: "27 okt 2026 · 15:19",
    actor: "Ruben Visser",
    actorRole: "Owner",
    tenant: "studio-morgen",
    client: "Studio Morgen",
    version: "v3",
    action: "Resubmitted",
    reason: "Aanvulling op Q3 en bronverwijzing toegevoegd",
    source: "Klantdashboard",
    status: "Immutable",
  },
  {
    id: "evt-1039",
    time: "27 okt 2026 · 11:08",
    actor: "Daan Koster",
    actorRole: "Reviewer",
    tenant: "ambachtelijk",
    client: "Ambachtelijk Vastgoed",
    version: "v2",
    action: "Review gestart",
    reason: "Nieuwe Project Brief beschikbaar voor controle",
    source: "Review Studio",
    status: "Immutable",
  },
  {
    id: "evt-1038",
    time: "26 okt 2026 · 14:33",
    actor: "System",
    actorRole: "Platform",
    tenant: "helder-groen",
    client: "Helder Groen",
    version: "v1",
    action: "Monitoring-alert geregistreerd",
    reason: "Leadformulier gaf tijdelijk een foutstatus terug",
    source: "Monitoring",
    status: "Immutable",
  },
];

export const adminWebsites = [
  { client: "Northline Fysio", domain: "northline-fysio.nl", environment: "Live", version: "v1.4", gate: "Gate B akkoord", lastCheck: "Vandaag, 08:55", tone: "success" as AdminTone },
  { client: "Helder Groen", domain: "heldergroen.nl", environment: "Live", version: "v1.1", gate: "Monitoring actief", lastCheck: "Vandaag, 08:26", tone: "success" as AdminTone },
  { client: "Studio Morgen", domain: "studiomorgen.nl", environment: "Staging", version: "v0.8", gate: "Wacht op aanvulling", lastCheck: "Gisteren, 16:42", tone: "warning" as AdminTone },
  { client: "Ambachtelijk Vastgoed", domain: "ambachtelijkvastgoed.nl", environment: "Briefing", version: "—", gate: "Gate 1 geblokkeerd", lastCheck: "Nog niet gestart", tone: "neutral" as AdminTone },
];

export const adminIncidents = [
  { client: "Helder Groen", kind: "Leadformulier", status: "In onderzoek", impact: "Nieuwe leads mogelijk vertraagd", time: "28 okt · 08:26", tone: "warning" as AdminTone },
  { client: "Northline Fysio", kind: "Trackingcontrole", status: "Opgelost", impact: "Geen klantimpact vastgesteld", time: "27 okt · 17:11", tone: "success" as AdminTone },
  { client: "Studio Morgen", kind: "Staging health check", status: "Wacht op productie", impact: "Geen live-impact", time: "27 okt · 15:04", tone: "info" as AdminTone },
];

export const adminIntelligenceSignals = [
  { title: "Formulierfrictie op mobiel", detail: "Clarity-signaal · 18 sessies · controle vereist", status: "Review nodig", tone: "warning" as AdminTone },
  { title: "Meer organisch verkeer", detail: "GSC-trend · +21% ten opzichte van vorige periode", status: "Onderbouwd", tone: "success" as AdminTone },
  { title: "CTA-variant presteert stabiel", detail: "GA4-eventreeks · 30 dagen · steekproef beschikbaar", status: "Inzicht", tone: "info" as AdminTone },
];

export const adminSources = [
  { name: "Google Analytics 4", shortName: "GA4", status: "Verbonden", scope: "Sessies, conversies en events", freshness: "Vandaag, 08:55", tone: "success" as AdminTone },
  { name: "Google Search Console", shortName: "GSC", status: "Verbonden", scope: "Zoekopdrachten en landingspagina’s", freshness: "Vandaag, 07:40", tone: "success" as AdminTone },
  { name: "Microsoft Clarity", shortName: "Clarity", status: "Verbonden", scope: "Opnames en gedragsignalen", freshness: "Gisteren, 23:10", tone: "success" as AdminTone },
  { name: "DataForSEO", shortName: "DFS", status: "Niet geconfigureerd", scope: "SEO- en marktdata", freshness: "Geen synchronisatie", tone: "neutral" as AdminTone },
];

export const adminTemplates = [
  { name: "Personal trainer", version: "v1.2", status: "Actief", coverage: "Quiz, intakepipeline, eerste reactie", tone: "success" as AdminTone },
  { name: "Coach", version: "v0.9", status: "Concept", coverage: "Kennismaking en trajectaanbod", tone: "warning" as AdminTone },
  { name: "Installateur", version: "v0.4", status: "Concept", coverage: "Offerte, inspectie en opdracht", tone: "warning" as AdminTone },
];

export const adminSupportRequests = [
  { subject: "Formulier toont geen bevestiging", client: "Helder Groen", status: "In behandeling", received: "28 okt · 08:26", owner: "Daan Koster", tone: "warning" as AdminTone },
  { subject: "Nieuwe sectie op dienstenpagina", client: "Northline Fysio", status: "Scope beoordelen", received: "27 okt · 14:02", owner: "Lotte Meijer", tone: "info" as AdminTone },
  { subject: "Vraag over maandrapportage", client: "Studio Morgen", status: "Beantwoord", received: "26 okt · 10:18", owner: "Sanne de Vries", tone: "success" as AdminTone },
];
