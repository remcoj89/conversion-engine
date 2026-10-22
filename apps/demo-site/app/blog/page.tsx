import type { Metadata } from "next";
import { BlogCard } from "../../components/BlogCard";
import { Section } from "../../components/Section";
import { blogPage, pageSeo } from "../../content/demo";
import { publishedPosts } from "../../lib/blog";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata(pageSeo.blog);

// Blogoverzicht: BL-01 hero, BL-02 uitgelicht artikel, BL-03 overzicht. BL-04 filters niet actief.
export default function BlogIndexPage() {
  const posts = publishedPosts();
  const featured = posts.find((post) => post.featured) ?? posts[0];
  const rest = posts.filter((post) => post !== featured);

  return (
    <>
      <section className="hero hero--center hero--compact" aria-labelledby="blog-title">
        <div className="container container--narrow">
          <p className="eyebrow">{blogPage.hero.eyebrow}</p>
          <h1 id="blog-title">{blogPage.hero.title}</h1>
          <p className="lead">{blogPage.hero.text}</p>
        </div>
      </section>

      {featured ? (
        <section className="section section--tight" aria-label="Uitgelicht artikel">
          <div className="container">
            <BlogCard post={featured} readLabel={blogPage.readLabel} featured headingLevel={2} />
          </div>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <Section tone="muted" intro={{ title: blogPage.listTitle }}>
          <ul className="blog-grid">
            {rest.map((post, index) => (
              <li key={post.slug}>
                <BlogCard post={post} readLabel={blogPage.readLabel} index={index + 1} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
