import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { topicLinks } from "../scripts/blog-topics";

export const prerender = true;

const mainRoutes = ["/", "/about/", "/blog/", "/projects/", "/resume/"];
const xmlEscape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error("The Astro site URL is required for canonical sitemap links");
  const published = await getCollection("blog", ({ data }) => !data.draft);
  const articleRoutes = published.map(({ slug }) => `/blog/${slug}/`);
  const topicRoutes = topicLinks(published.flatMap(({ data }) => data.tags)).map(({ href }) => href);
  // Same trailing-slash routes and canonical origin as the page layouts.
  // Export only URLs, never titles, frontmatter, source files or guessed lastmod values.
  const routes = Array.from(new Set([...mainRoutes, ...articleRoutes, ...topicRoutes])).sort();
  const entries = routes.map(path => `  <url><loc>${xmlEscape(new URL(path, site).href)}</loc></url>`);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
