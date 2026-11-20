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
    "404.html",
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
    if (path === "404.html") continue;
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
  const { meta } = headMetadata(about);
  assert.match(meta.description, /Computer Engineering graduate student @ NJIT/);
  assert.equal((about.split("</head>")[1].match(/Computer Engineering graduate student @ NJIT/g) || []).length, 1);
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
  const home = read("index.html");
  const systemsNotes = home.match(/<section[^>]*\bdata-systems-notes[^>]*>[\s\S]*?<\/section>/)?.[0];
  if (!systemsNotes) {
    assert.ok(home.includes(`href="${featured[1]}"`), "Fallback preserves the latest article link");
  }
  for (const slug of ["endianness", "s390-linux-kernel"]) {
    const published = files.includes(`blog/${slug}/index.html`);
    const links = (systemsNotes ?? "").split(`href="/blog/${slug}/"`).length - 1;
    assert.equal(links, Number(published), `Systems Notes link for ${slug}`);
  }
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
    assert.notEqual(url.pathname, "/404/");
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

test("the top-level 404 has useful links, no canonical, and cannot enter the sitemap", () => {
  const html = read("404.html");
  assert.match(html, /<title>Page not found — Patryk Opilka<\/title>/);
  assert.match(html, /<h1[^>]*>Page not found\.<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.doesNotMatch(html, /rel="canonical"|http-equiv="refresh"|data-green-console/);
  const main = html.match(/<main[^>]+>[\s\S]*?<\/main>/)?.[0];
  assert.ok(main);
  for (const href of ["/", "/blog/"]) assert.ok(main.includes(`href="${href}"`), href);
  assert.doesNotMatch(read("sitemap.xml"), /\/404(?:\.html|\/)<\/loc>/);
});

test("Projects uses a local diagonal carousel around SimpleJim with a readable no-script project list", () => {
  const page = read("projects/index.html");
  const gallery = page.match(/<section[^>]*data-project-carousel[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(gallery);
  assert.match(gallery, /data-initial-index="1"/);
  assert.match(gallery, /<h1[^>]*id="projects-title"[^>]*>Projects/);
  const cards = [...gallery.matchAll(/<button[^>]*data-carousel-card[^>]*>[\s\S]*?<\/button>/g)].map(([html]) => html);
  assert.equal(cards.length, 3);
  assert.match(cards[0], /aria-controls="project-workbench" aria-pressed="false"/);
  assert.match(cards[1], /aria-controls="project-simplejim" aria-pressed="true"/);
  assert.match(cards[2], /aria-controls="project-tools" aria-pressed="false"/);
  assert.equal(cards.filter(card => card.includes("RESERVED")).length, 2);
  assert.ok(cards.every(card => card.includes('viewBox="0 0 300 400"')));
  const articles = [...gallery.matchAll(/<article[^>]*data-carousel-panel[^>]*>[\s\S]*?<\/article>/g)].map(([html]) => html);
  assert.equal(articles.length, 3);
  for (const item of articles)
    assert.doesNotMatch(item.match(/^<article[^>]*>/)?.[0], /\shidden(?:\s|=|>)/);
  assert.match(articles[0], /Back on the workbench\./);
  assert.match(articles[1], /Record sets, reps, and weight\.[\s\S]*Autosave workout drafts locally\.[\s\S]*Revisit saved workout history\./);
  assert.match(articles[2], /Useful things, made carefully\./);
  for (const item of [articles[0], articles[2]]) {
    assert.match(item, /Being prepared/);
    assert.doesNotMatch(item, /<ul|<a\s/);
  }
  assert.doesNotMatch(gallery, /codepen\.io|<iframe|project-case|polishedcrumb|<script[^>]*src="https?:/i);
  for (const path of files.filter((p) => p !== "projects/index.html"))
    assert.doesNotMatch(read(path), /data-project-carousel/);
  const styles = [...page.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)]
    .map((m) => read(m[1])).join("\n");
  assert.match(styles, /aspect-ratio:3\/4/);
  assert.match(styles, /touch-action:pan-y pinch-zoom/);
  assert.match(styles, /\.gallery-card(?:\[data-astro-cid-[^\]]+\])?\{[^{}]*touch-action:pan-y pinch-zoom/);
  assert.match(styles, /\.project-gallery(?:\[data-astro-cid-[^\]]+\])?\[data-ready\][^{]*\.gallery-stage/);
});

test("Projects alone has a click-through matrix canvas and a manual motion toggle", () => {
  const page = read("projects/index.html");
  assert.match(page, /<div[^>]+class="project-atmosphere"[^>]+aria-hidden="true"[^>]*><canvas[^>]+data-projects-matrix/);
  assert.match(page, /<button[^>]+data-matrix-toggle[^>]+hidden[^>]*>Pause background<\/button>/);
  for (const path of files.filter((p) => p !== "projects/index.html"))
    assert.doesNotMatch(read(path), /data-projects-matrix|data-matrix-toggle/);
  const styles = [...page.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)]
    .map((m) => read(m[1])).join("\n");
  assert.match(styles, /\.project-atmosphere[^{}]*\{[^{}]*position:fixed[^{}]*inset:0[^{}]*pointer-events:none/);
});

function decodeHtmlText(value) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, decimal, hex, name) =>
    decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(Number.parseInt(hex, 16)) :
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name.toLowerCase()]);
}

function headMetadata(html) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head);
  const entries = [...head.matchAll(/<meta (?:name|property)="([^"]+)" content="([^"]*)"/g)];
  assert.equal(new Set(entries.map(([, name]) => name)).size, entries.length);
  return { head, meta: Object.fromEntries(entries.map(([, name, value]) => [name, value])) };
}

test("public pages have distinct search descriptions and matching text-only link metadata", () => {
  const descriptions = new Set();
  for (const path of files) {
    const { head, meta } = headMetadata(read(path));
    if (path === "404.html") {
      assert.equal(meta.robots, "noindex");
      assert.doesNotMatch(head, /<link rel="canonical"|property="og:|name="twitter:|application\/ld\+json/);
      continue;
    }
    const title = decodeHtmlText(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    assert.ok(meta.description && !descriptions.has(meta.description), path);
    descriptions.add(meta.description);
    assert.ok(title, path);
    assert.equal(decodeHtmlText(meta["og:title"]), title, path);
    assert.equal(decodeHtmlText(meta["twitter:title"]), title, path);
    assert.equal(meta["og:description"], meta.description, path);
    assert.equal(meta["twitter:description"], meta.description, path);
    assert.equal(meta["og:url"], head.match(/rel="canonical" href="([^"]+)"/)?.[1], path);
    assert.equal(meta["og:site_name"], "Patryk Opilka", path);
    assert.equal(meta["twitter:card"], "summary", path);
    assert.ok(!meta["og:image"] && !meta["twitter:image"], path);
  }
});

test("BlogPosting metadata matches the public article headline, author, publication date, and canonical URL", () => {
  for (const path of files) {
    const html = read(path);
    const { head, meta } = headMetadata(html);
    const declarations = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const article = /^blog\/[^/]+\/index\.html$/.test(path);
    assert.equal(declarations.length, article ? 1 : 0, path);
    assert.equal(meta["og:type"], path === "404.html" ? undefined : article ? "article" : "website", path);
    if (!article) continue;
    const schema = JSON.parse(declarations[0][1]);
    const visibleHeadline = html.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/)?.[1];
    assert.ok(visibleHeadline, path);
    assert.equal(schema["@context"], "https://schema.org");
    assert.equal(schema["@type"], "BlogPosting");
    assert.equal(schema.headline, decodeHtmlText(visibleHeadline.replace(/<[^>]+>/g, "")), path);
    assert.equal(schema.description, decodeHtmlText(meta.description), path);
    assert.match(html, /BY<\/span>\s*<span>Patryk Opilka<\/span>/);
    assert.deepEqual(schema.author, { "@type": "Person", name: "Patryk Opilka", url: "https://patrykopilka.me/about/" });
    assert.equal(schema.datePublished, html.match(/<time datetime="([^"]+)"/)?.[1], path);
    assert.equal(meta["article:published_time"], schema.datePublished, path);
    assert.equal(schema.mainEntityOfPage["@id"], meta["og:url"], path);
    assert.equal(schema.dateModified, undefined);
    assert.equal(schema.image, undefined);
  }
});
