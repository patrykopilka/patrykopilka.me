export function topicSlug(tag: string) {
  return tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function topicHref(slug: string) {
  return `/blog/topics/${slug}/`;
}

export function topicLinks(tags: string[]) {
  const topics = new Map<string, string>();
  for (const tag of tags) {
    const slug = topicSlug(tag);
    if (slug && !topics.has(slug)) topics.set(slug, tag.trim());
  }
  return [...topics].map(([slug, label]) => ({ label, slug, href: topicHref(slug) }));
}
