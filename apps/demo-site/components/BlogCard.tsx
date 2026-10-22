import Link from "next/link";
import type { BlogPost } from "../content/types";
import { formatDate } from "../lib/blog";
import { Visual } from "./Blocks";

type Props = Readonly<{ post: BlogPost; readLabel: string; featured?: boolean; index?: number; headingLevel?: 2 | 3 }>;

// Blogkaart (BL-02, BL-03): titel, samenvatting, onderwerp, datum, leestijd, visual en CTA.
export function BlogCard({ post, readLabel, featured = false, index = 0, headingLevel = 3 }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={featured ? "blog-card blog-card--featured" : "blog-card"}>
      <Visual variant={index} />
      <div className="blog-card__body">
        <p className="blog-card__meta">
          <span className="badge badge--soft">{post.topic}</span>
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} min lezen</span>
        </p>
        <Heading className="blog-card__title">{post.title}</Heading>
        <p>{post.summary}</p>
        <Link href={`/blog/${post.slug}`} className="text-link">
          {readLabel}
          <span className="visually-hidden">: {post.title}</span>
        </Link>
      </div>
    </article>
  );
}
