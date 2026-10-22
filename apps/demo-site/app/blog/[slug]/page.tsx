import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Visual } from "../../../components/Blocks";
import { BlogCard } from "../../../components/BlogCard";
import { CtaButton } from "../../../components/CtaButton";
import { blogPage } from "../../../content/demo";
import type { BlogBlock, BlogPost } from "../../../content/types";
import { findPost, formatDate, publishedPosts, relatedPosts } from "../../../lib/blog";
import { pageMetadata } from "../../../lib/seo";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export function generateStaticParams() {
  return publishedPosts().map((post) => ({ slug: post.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = findPost((await params).slug);
  if (!post) return {};
  return pageMetadata(
    { title: post.seoTitle, description: post.seoDescription, path: `/blog/${post.slug}` },
    { type: "article", publishedTime: post.publishedAt },
  );
}

// Blogdetail: BL-05 header, BL-06 inhoud met BL-07 CTA, BL-10 afsluiting, BL-08 auteur, BL-09 gerelateerd.
export default async function BlogPostPage({ params }: Props) {
  const post = findPost((await params).slug);
  if (!post) notFound();
  const related = relatedPosts(post);

  return (
    <article className="article">
      <header className="article__header">
        <div className="container container--text">
          <p className="article__meta">
            <Link href="/blog" className="text-link">
              ← Blog
            </Link>
            <span className="badge badge--soft">{post.topic}</span>
          </p>
          <h1>{post.title}</h1>
          <p className="lead">{post.summary}</p>
          <p className="article__byline">
            Door <strong>{post.author}</strong> · <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            {post.updatedAt ? (
              <>
                {" "}
                · bijgewerkt <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
              </>
            ) : null}{" "}
            · {post.readingMinutes} min lezen
          </p>
        </div>
        <div className="container container--text">
          <Visual variant={0} label={post.imageAlt} />
        </div>
      </header>

      <div className="container container--text prose article__body">
        {post.content.map((block, index) => (
          <ArticleBlock key={index} block={block} post={post} />
        ))}

        <section className="article__closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Kort samengevat</h2>
          <p>{post.conclusion}</p>
          <CtaButton cta={post.inlineCta.cta} />
        </section>
      </div>

      <aside className="container container--text author" aria-label="Over de auteur">
        <Visual variant={1} />
        <div>
          <p className="author__name">
            {blogPage.authorBio.name} <span>— {blogPage.authorBio.role}</span>
          </p>
          <p>{blogPage.authorBio.bio}</p>
          <CtaButton cta={blogPage.authorBio.link} variant="text" />
        </div>
      </aside>

      {related.length > 0 ? (
        <section className="section section--muted" aria-labelledby="related-title">
          <div className="container">
            <h2 id="related-title">{blogPage.relatedTitle}</h2>
            <ul className="blog-grid">
              {related.map((item, index) => (
                <li key={item.slug}>
                  <BlogCard post={item} readLabel={blogPage.readLabel} index={index + 2} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </article>
  );
}

function ArticleBlock({ block, post }: Readonly<{ block: BlogBlock; post: BlogPost }>) {
  switch (block.type) {
    case "h2":
      return <h2>{block.text}</h2>;
    case "h3":
      return <h3>{block.text}</h3>;
    case "p":
      return (
        <p>
          {block.text}
          {block.link ? (
            <>
              {" "}
              <Link href={block.link.href}>{block.link.label}</Link>.
            </>
          ) : null}
        </p>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "callout":
      return <aside className="callout">{block.text}</aside>;
    case "table":
      return (
        <div className="table-wrap">
          <table>
            <caption>{block.caption}</caption>
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={cell} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={cell}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cta":
      return (
        <aside className="inline-cta" aria-label={post.inlineCta.title}>
          <p className="inline-cta__title">{post.inlineCta.title}</p>
          <p>{post.inlineCta.text}</p>
          <CtaButton cta={post.inlineCta.cta} />
        </aside>
      );
  }
}
