// Contentmodel van de demosite. Componenten lezen alleen deze vormen; een klantwebsite
// vervangt later de content, niet de componenten.

export type Cta = Readonly<{ label: string; href: string }>;

export type Seo = Readonly<{ title: string; description: string; path: string }>;

export type Card = Readonly<{ title: string; text: string }>;

export type Faq = Readonly<{ question: string; answer: string }>;

// Voorbeeldreviews zijn altijd als voorbeeld gemarkeerd; echte reviews moeten controleerbaar zijn.
export type Testimonial = Readonly<{ quote: string; name: string; context: string; isExample: boolean }>;

export type SectionIntro = Readonly<{ eyebrow?: string; title: string; text?: string }>;

export type QuizOption = Readonly<{ id: string; label: string; scores: Readonly<Record<string, number>> }>;

export type QuizQuestion = Readonly<{ id: string; question: string; options: readonly QuizOption[] }>;

export type QuizProfile = Readonly<{
  id: string;
  title: string;
  summary: string;
  rhythm: string;
  firstAction: string;
}>;

// Deterministisch: vaste scores per antwoord, gelijkspel wordt beslist door de volgorde van `profiles`.
export type QuizConfig = Readonly<{
  version: string;
  name: string;
  questions: readonly QuizQuestion[];
  profiles: readonly QuizProfile[];
}>;

export type UpsellType =
  | "kennismaking"
  | "startsessie"
  | "persoonlijk-plan"
  | "coachingtraject"
  | "intake"
  | "proefles";

export type Upsell = Readonly<{
  type: UpsellType;
  transition: string;
  title: string;
  outcome: string;
  forWho: string;
  included: readonly string[];
  timeInvestment: string;
  price: string;
  riskReversal: string;
  cta: Cta;
}>;

export type BlogBlock =
  | Readonly<{ type: "h2" | "h3"; text: string }>
  | Readonly<{ type: "p"; text: string; link?: Cta }>
  | Readonly<{ type: "list"; items: readonly string[] }>
  | Readonly<{ type: "callout"; text: string }>
  | Readonly<{ type: "table"; caption: string; head: readonly string[]; rows: readonly (readonly string[])[] }>
  // Plaats van de inhoudelijke CTA (BL-07) binnen het artikel.
  | Readonly<{ type: "cta" }>;

export type BlogPost = Readonly<{
  slug: string;
  status: "concept" | "gepland" | "gepubliceerd";
  featured: boolean;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  topic: string;
  author: string;
  publishedAt: string;
  updatedAt?: string;
  readingMinutes: number;
  imageAlt: string;
  content: readonly BlogBlock[];
  inlineCta: Readonly<{ title: string; text: string; cta: Cta }>;
  conclusion: string;
  related: readonly string[];
}>;
