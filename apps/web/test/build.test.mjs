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

test("homepage uses four distinct planets from the supplied pack", () => {
  const home = read("index.html");
  for (const variant of ["ice", "ringed", "forest", "mechanical"]) {
    assert.equal((home.match(new RegExp(`planet-art--${variant}`, "g")) || []).length, 1);
  }
  const sprites = [...home.matchAll(/<image[^>]+href="([^"]+planet-pack[^\"]+\.webp)"/g)];
  assert.equal(sprites.length, 4);
  assert.equal(new Set(sprites.map((match) => match[1])).size, 1);
  assert.doesNotMatch(home, /earthShade|venusShade|jupiterShade/);
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
