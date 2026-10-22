import { blogPosts } from "../content/demo";
import type { BlogPost } from "../content/types";

// Alleen gepubliceerde artikelen met H1, auteur, inhoud en CTA zijn zichtbaar (blog-spec §5).
export function isPublishable(post: BlogPost): boolean {
  return (
    post.status === "gepubliceerd" &&
    post.title.trim() !== "" &&
    post.author.trim() !== "" &&
    post.content.length > 0 &&
    post.inlineCta.cta.href !== ""
  );
}

export function publishedPosts(): BlogPost[] {
  return blogPosts.filter(isPublishable).toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function findPost(slug: string): BlogPost | undefined {
  return publishedPosts().find((post) => post.slug === slug);
}

// Maximaal drie gerelateerde artikelen (BL-09), handmatig geselecteerd.
export function relatedPosts(post: BlogPost): BlogPost[] {
  return post.related
    .map((slug) => findPost(slug))
    .filter((related): related is BlogPost => related !== undefined && related.slug !== post.slug)
    .slice(0, 3);
}

const dateFormat = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
