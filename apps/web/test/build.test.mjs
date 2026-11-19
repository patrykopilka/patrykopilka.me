import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const files = readdirSync(dist, { recursive: true }).filter((p) =>
  p.endsWith(".html"),
);
const read = (p) => readFileSync(resolve(dist, p), "utf8");

test("production output has expected published pages and no review interface", () => {
  const articlePages = process.env.BLOG_EXPECT_ARTICLES ? process.env.BLOG_EXPECT_ARTICLES.split(",").map(slug => `blog/${slug}/index.html`) : [];
  assert.deepEqual(files.filter(path => !path.startsWith("blog/topics/")).sort(), [
    ...articlePages,
    "about/index.html",
    "blog/hello-world/index.html",
    "blog/index.html",
    "index.html",
    "projects/index.html",
    "resume/index.html",
  ].sort());
  for (const path of files) {
    const html = read(path);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, path);
    assert.doesNotMatch(
      html,
      /Private review|Choose a direction|\/explore\/|name="robots" content="noindex/,
    );
    assert.match(html, /rel="canonical" href="https:\/\/patrykopilka\.me\//);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${path}: duplicate IDs`);
  }
});

test("every local page link and asset resolves in the production output", () => {
  for (const path of files) {
    const html = read(path);
    for (const [, reference] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|data:|#|\/\/)/.test(reference)) continue;
      const pathname = decodeURI(reference.split(/[?#]/)[0]);
      const target = pathname.startsWith("/")
        ? resolve(dist, pathname.slice(1))
        : resolve(dist, dirname(path), pathname);
      assert.ok(
        existsSync(target) || existsSync(resolve(target, "index.html")),
        `${path}: missing ${reference}`,
      );
      if (existsSync(target) && statSync(target).isDirectory()) {
        assert.ok(
          existsSync(resolve(target, "index.html")),
          `${path}: directory without index ${reference}`,
        );
      }
    }
  }
});

test("rendered IBM entry is limited to the approved sentence and start date", () => {
  const resume = read("resume/index.html");
  assert.match(
    resume,
    /Experience in IBM Z I\/O enablement, with a technical focus on PCIe bring-up and Linux on s390x\./,
  );
  assert.match(resume, /datetime="2026-05-18"[^>]*>May 18, 2026<\/time>/);
  for (const path of ["resume/index.html", "about/index.html", "index.html"])
    assert.doesNotMatch(read(path), /DMA|VFIO|IOMMU|\[Role title\]|\[Dates\]/);
});

test("existing blog post is discoverable on the homepage and blog index", () => {
  assert.match(read("blog/index.html"), /href="\/blog\/hello-world\/"/);
  assert.match(read("index.html"), /href="\/blog\/[^"]+\/"/);
});

test("homepage ships decorative static waves, no rays, and the MIT notice", () => {
  const home = read("index.html");
  assert.match(home, /data-matrix-waves aria-hidden="true"/);
  assert.match(home, /viewBox="0 0 1200 800"/);
  assert.doesNotMatch(home, /data-rays/);
  assert.match(read("licenses/wodniack-waves.txt"), /Copyright \(c\) Antoine Wodniack/);
  assert.match(read("licenses/wodniack-waves.txt"), /Permission is hereby granted/);
});

test("only the homepage opts into the full-width hero with a separate content column", () => {
  const home = read("index.html");
  assert.match(home, /<main id="main" class="container container--full-bleed"/);
  assert.ok(/data-matrix-waves[\s\S]*?<\/svg>\s*<\/div>\s*(?:<script[^>]*><\/script>\s*)?<div class="home-content"/.test(home));
  for (const path of files.filter((p) => p !== "index.html"))
    assert.doesNotMatch(read(path), /<main[^>]*container--full-bleed/);
});

test("Green Console plus a single reduced-motion-aware phosphor echo is homepage-only", () => {
  const home = read("index.html");
  const header = home.match(/<header[^>]*data-green-console[^>]*>[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, "homepage renders the Green Console header");
  assert.match(header, /class="console-effects" aria-hidden="true"/);
  assert.match(header, /aria-label="Patryk Opilka, home"/);
  assert.equal((header.match(/class="console-wordmark"/g) || []).length, 1);
  for (const href of ["/blog/", "/projects/", "/resume/", "/about/"])
    assert.ok(header.includes(`href="${href}"`));
  for (const path of files.filter((p) => p !== "index.html")) {
    assert.match(read(path), /<header class="site-header"/);
    assert.doesNotMatch(read(path), /data-green-console/);
  }
  const styles = [...home.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)]
    .map((m) => read(m[1])).join("\n");
  assert.match(styles, /prefers-reduced-motion:\s*no-preference[^{]*\{\s*\.console-wordmark[^{}]*\{animation:[^{}]*phosphor-wordmark/);
  assert.doesNotMatch(styles, /animation:[^};]*phosphor-(?:wordmark|trail)[^};]*infinite/);
});

test("homepage uses four distinct locally hosted solar planets and the same links", () => {
  const home = read("index.html");
  const links = [["neptune", "/blog/", "Writing"], ["saturn", "/resume/", "Résumé"], ["earth", "/about/", "About"], ["jupiter", "/projects/", "Projects"]];
  let assetBytes = 0;
  for (const [name, href, label] of links) {
    assert.equal((home.match(new RegExp(`data-planet="${name}"`, "g")) || []).length, 1);
    const planetLink = [...home.matchAll(/<a[^>]*class="planet-link"[^>]*>[\s\S]*?<\/a>/g)]
      .find((m) => m[0].includes(`data-planet="${name}"`))?.[0];
    assert.ok(planetLink?.includes(`href="${href}"`) && planetLink.includes(`>${label}<`), name);
    const asset = resolve(dist, `images/solar-planets/${name}.webp`);
    const bytes = readFileSync(asset);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assetBytes += bytes.length;
  }
  assert.ok(assetBytes < 140_000);
  assert.match(home, /saturn-rings--back/);
  assert.match(home, /saturn-rings--front/);
  assert.match(home, /href="\/licenses\/solar-orbits\.txt"/);
  assert.match(read("licenses/solar-orbits.txt"), /Solar System Scope/);
  assert.doesNotMatch(home, /planet-pack/);
  const styles = [...home.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map((m) => read(m[1])).join("\n");
  assert.match(styles, /prefers-reduced-motion:\s*no-preference[^{}]*\{[^{}]*\.solar-surface[^{}]*\{animation:solar-longitude/);
  assert.match(styles, /data-motion=paused[^{}]*\.solar-surface[^{}]*\{animation-play-state:paused/);
});

test("About copy and description use the graduate-student title", () => {
  const about = read("about/index.html");
  assert.equal((about.match(/Computer Engineering graduate student @ NJIT/g) || []).length, 2);
  for (const path of files) assert.doesNotMatch(read(path), /Computer Engineering student/);
});


test("public output never includes raw article manuscripts or design controls", () => {
  const output = readdirSync(dist, { recursive: true });
  assert.equal(output.some(path => /\.(?:md|mdx)$/.test(path)), false);
  for (const path of files.filter(path => path.startsWith('blog/'))) {
    assert.doesNotMatch(read(path), /Markdown source|source\.md|Choose a typeface|Grain slider/);
    assert.match(read(path), /class="ledger-blog"/);
  }
});

test("numbered article headings use periods without changing their anchors", () => {
  for (const path of files.filter(path => path.startsWith("blog/"))) {
    const html = read(path);
    for (const [, attributes, content] of html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)) {
      const text = content.replace(/<[^>]*>/g, "").trim();
      if (!/^\d+(?:[:.)]|\s)/.test(text)) continue;
      assert.match(text, /^\d+\.\s+\S/, `${path}: section number needs a period separator`);
      const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
      assert.ok(id, `${path}: section anchor is missing`);
      assert.match(html, new RegExp(`href="#${id}"`), `${path}: section link is missing`);
    }
  }
});

test("rendered portfolio and journal navigation use direct directory URLs", () => {
  for (const path of files) {
    const html = read(path);
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      if (!/^\/(?:about|projects|resume|blog)(?:\/|[?#]|$)/.test(href)) continue;
      assert.match(href.split(/[?#]/)[0], /\/$/, `${path}: noncanonical link ${href}`);
    }
  }
  for (const section of ["about", "projects", "resume", "blog"]) {
    assert.match(read(`${section}/index.html`), new RegExp(`href="/${section}/" aria-current="page"`));
  }
  const journal = read("blog/index.html");
  const featured = /<a class="featured-article[^"]*" href="([^"]+)"/.exec(journal);
  assert.ok(featured, "Journal latest article link is missing");
  assert.ok(read("index.html").includes(`href="${featured[1]}"`), "Home and Journal must link to the same latest article");
  if (files.includes("blog/endianness/index.html")) {
    assert.match(journal, /href="\/blog\/endianness\/"/);
  }
});

test("Projects introduces SimpleJim as an early Android prototype and links its source", () => {
  const html = read("projects/index.html");
  const slot = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([card]) => card).find((card) => /<h2\b[^>]*>SimpleJim<\/h2>/.test(card));
  assert.ok(slot, "SimpleJim project card missing");
  assert.match(slot, /Early Android prototype/);
  assert.match(slot, /offline lift log for Android.*sets, reps, and weight.*saved workout history/);
  assert.match(slot, /href="https:\/\/github\.com\/po63njit\/SimpleJim"/);
  assert.match(slot, /SimpleJim source on GitHub/);
  assert.doesNotMatch(slot, /Play Store|Install now|Download APK/);
});

test("topic links generate static filtered pages and preserve every matching article", () => {
  const paths = files.filter(p => /^blog\/[^/]+\/index\.html$/.test(p));
  const topicRoutes = html => new Set([...html.matchAll(/href="(\/blog\/topics\/[a-z0-9-]+\/)"/g)].map(([, route]) => route));
  const tags = new Map(paths.map(path => [
    '/' + path.replace(/index\.html$/, ''),
    topicRoutes(read(path)),
  ]));
  const allTopics = new Set([...tags.values()].flatMap(topicSet => [...topicSet]));
  assert.ok(allTopics.has('/blog/topics/intro/'));
  assert.deepEqual(topicRoutes(read('blog/index.html')), allTopics);
  assert.match(read('blog/index.html'), /href="\/blog\/" aria-current="page">All topics<\/a>/);
  assert.deepEqual(
    files.filter(p => p.startsWith('blog/topics/')).sort(),
    [...allTopics].map(route => route.slice(1) + 'index.html').sort()
  );
  for (const route of allTopics) {
    const html = read(route.slice(1) + 'index.html');
    assert.match(html, new RegExp('href="' + route + '" aria-current="page"'));
    assert.match(html, new RegExp('rel="canonical" href="https://patrykopilka.me' + route + '"'));
    assert.match(html, /aria-label="Filter by topic"/);
    const matches = [...tags].filter(([, topicSet]) => topicSet.has(route)).map(([post]) => post).sort();
    const actual = [...html.matchAll(/href="(\/blog\/(?!topics\/)[^/"]+\/)"/g)].map(([, post]) => post).sort();
    assert.deepEqual(actual, matches, route);
  }
});

test("long-form figures have accessible titles and static content", () => {
  const check = (html, markers) => {
    for (const id of markers) {
      assert.match(html, new RegExp(`<figure[^>]+aria-labelledby="${id}"`), id);
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
  };
  const root = new URL("../dist/blog/", import.meta.url);
  const read = (slug) => {
    try { return readFileSync(new URL(`${slug}/index.html`, root), "utf8"); }
    catch (error) { if (error.code === "ENOENT") return ""; throw error; }
  };
  const endian = read("endianness");
  if (process.env.BLOG_EXPECT_FIGURES === "1" || endian.includes("wire-study-title")) check(endian, ["wire-study-title", "device-study-title", "fixture-study-title"]);
  const kernel = read("s390-linux-kernel");
  if (process.env.BLOG_EXPECT_FIGURES === "1" || kernel.includes("s390-lowcore-title")) check(kernel, ["s390-lowcore-title", "s390-boot-paths-title", "s390-dat-indices-title", "s390-io-routes-title"]);
});

test("homepage alone integrates the footer with a static wave-tail field", () => {
  const home = read("index.html");
  assert.match(home, /<body(?: [^>]*)? class="home-landing"/);
  const tail = home.match(/<div[^>]*data-home-landing-tail[^>]*>[\s\S]*?<\/section>\s*<\/div>/)?.[0];
  assert.ok(tail);
  const decoration = tail.match(/<svg[^>]*class="home-tail-art"[^>]*>[\s\S]*?<\/svg>/)?.[0];
  assert.ok(decoration);
  assert.match(decoration, /focusable="false" aria-hidden="true"/);
  assert.ok((decoration.match(/<path\s/g) || []).length > 20);
  assert.doesNotMatch(decoration, /<script|<animate|href=/);
  assert.match(tail, /aria-label="Around the site"/);
  assert.match(tail, /Beyond the orbit/);
  assert.match(tail, /href="\/projects\/"/);
  assert.match(tail, /href="\/blog\/[^"]+\/"/);
  const footer = home.match(/<footer[^>]*class="site-footer site-footer--home"[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer);
  assert.match(footer, /Patryk Opilka/);
  assert.match(footer, /Made with curiosity\. Built with Astro\./);
  assert.match(footer, /href="https:\/\/github\.com\/po63njit"/);
  for (const path of files.filter(p => p !== "index.html")) {
    assert.doesNotMatch(read(path), /data-home-landing-tail|class="[^"]*(?:home-landing|site-footer--home)/);
    assert.match(read(path), /<footer class="site-footer"/);
  }
});

test("sitemap is URL-only XML listing exactly the exported canonical indexable HTML", () => {
  const body = read("sitemap.xml");
  const lines = body.trimEnd().split("\n");
  assert.equal(lines[0], '<?xml version="1.0" encoding="UTF-8"?>');
  assert.equal(lines[1], '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  assert.equal(lines.at(-1), "</urlset>");
  const actual = lines.slice(2, -1).map(line => {
    const entry = line.match(/^  <url><loc>(https:\/\/patrykopilka\.me\/[^<]*)<\/loc><\/url>$/);
    assert.ok(entry, `unexpected sitemap entry: ${line}`);
    const url = new URL(entry[1]);
    assert.equal(url.origin, "https://patrykopilka.me");
    assert.ok(url.pathname.endsWith("/"), url.href);
    assert.equal(url.search + url.hash, "");
    assert.doesNotMatch(url.pathname, /\.mdx?(?:\/|$)|\/_astro\/|\/licenses\/|\/private\//i);
    return url.href;
  });
  assert.equal(actual.length, new Set(actual).size);
  const expected = files.filter(path => !/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(read(path)))
    .map(path => {
      const match = read(path).match(/rel="canonical" href="(https:\/\/patrykopilka\.me\/[^"]*)"/);
      assert.ok(match, `missing canonical: ${path}`);
      const fromOutput = 'https://patrykopilka.me/' + path.replace(/index\.html$/, "");
      assert.equal(match[1], fromOutput, `canonical does not match output: ${path}`);
      return match[1];
    });
  assert.deepEqual(actual.slice().sort(), expected.sort());
});

test("robots.txt is plain text and names the exact HTTPS sitemap", () => {
  const robots = read("robots.txt");
  assert.equal(robots, "User-agent: *\nAllow: /\n\nSitemap: https://patrykopilka.me/sitemap.xml\n");
  assert.doesNotMatch(robots, /<!doctype|<html/i);
});
