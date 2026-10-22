import assert from "node:assert/strict";
import test from "node:test";
import { blogPosts, pageSeo, site, testimonials, thankYou } from "./demo";
import { isPublishable, publishedPosts, relatedPosts } from "../lib/blog";

test("navigatie bevat maximaal de kernroutes en geen leadmagnet-label", () => {
  assert.ok(site.nav.length <= 5);
  assert.deepEqual(site.nav.map((link) => link.href), ["/", "/sales", "/over-mij", "/blog", "/contact"]);
});

test("standaardupsell is een vrijblijvende kennismaking met dezelfde CTA als de primaire route", () => {
  assert.equal(thankYou.upsell.type, "kennismaking");
  assert.deepEqual(thankYou.upsell.cta, site.primaryCta);
});

test("alle voorbeeldreviews zijn als voorbeeld gemarkeerd", () => {
  assert.ok(testimonials.length > 0);
  assert.ok(testimonials.every((item) => item.isExample));
});

test("SEO-velden zijn per pagina gevuld en uniek", () => {
  const entries = Object.values(pageSeo);
  for (const seo of entries) {
    assert.ok(seo.title.trim() && seo.description.trim() && seo.path.startsWith("/"));
  }
  assert.equal(new Set(entries.map((seo) => seo.title)).size, entries.length);
  assert.equal(new Set(entries.map((seo) => seo.description)).size, entries.length);
});

test("blogartikelen hebben unieke slugs, verplichte velden en geldige gerelateerde artikelen", () => {
  const slugs = blogPosts.map((post) => post.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const post of blogPosts) {
    assert.match(post.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(isPublishable(post), post.slug);
    assert.ok(post.seoTitle && post.seoDescription && post.imageAlt, post.slug);
    assert.ok(post.content.some((block) => block.type === "cta"), `${post.slug} mist een inhoudelijke CTA`);
    assert.ok(relatedPosts(post).length <= 3);
    assert.ok(post.related.every((slug) => slugs.includes(slug) && slug !== post.slug), post.slug);
  }
  assert.ok(blogPosts.filter((post) => post.featured).length <= 1, "maximaal één uitgelicht artikel");
});

test("conceptartikelen worden niet gepubliceerd", () => {
  const draft = { ...blogPosts[0], slug: "concept", status: "concept" as const };
  assert.equal(isPublishable(draft), false);
  assert.ok(publishedPosts().every((post) => post.status === "gepubliceerd"));
});
