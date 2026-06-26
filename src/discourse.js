// Discourse adapter.
//
// Discourse powers thousands of forums and exposes clean JSON for almost every
// page simply by appending `.json` to the URL. That makes it the most robust,
// least-fragile target for scraping (no HTML guessing). Endpoints used:
//   {base}/latest.json?page=N         -> recent topics, sorted by activity
//   {base}/c/{slug}/{id}.json?page=N  -> topics within a single category
//   {base}/t/{id}.json                -> one topic with its first batch of posts
//   {base}/t/{id}/posts.json?...      -> remaining posts of a topic
//   {base}/categories.json            -> id -> name map (best effort)

import { fetchJson } from "./http.js";

const stripHtml = (html = "") =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|br|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const truncate = (s, n = 280) =>
  s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || "";

function pickAuthor(topic, usersById) {
  const posters = topic.posters || [];
  const op =
    posters.find((p) => /Original Poster/i.test(p.description || "")) ||
    posters[0];
  if (!op) return null;
  const u = usersById.get(op.user_id);
  return u ? u.username : null;
}

/** Normalize a Discourse topic-list entry into our common thread shape. */
export function normalizeTopic(topic, ctx) {
  const { baseUrl, usersById = new Map(), categoriesById = new Map() } = ctx;
  return {
    id: topic.id,
    title: topic.fancy_title || topic.title,
    url: `${baseUrl}/t/${topic.slug}/${topic.id}`,
    author: pickAuthor(topic, usersById),
    createdAt: topic.created_at || null,
    lastActivity: topic.bumped_at || topic.last_posted_at || topic.created_at,
    replies:
      typeof topic.reply_count === "number"
        ? topic.reply_count
        : Math.max(0, (topic.posts_count || 1) - 1),
    posts: topic.posts_count || null,
    views: topic.views ?? null,
    likes: topic.like_count ?? null,
    category: categoriesById.get(topic.category_id) || null,
    pinned: !!topic.pinned,
    excerpt: truncate(topic.excerpt ? stripHtml(topic.excerpt) : "", 280),
  };
}

/** Normalize a Discourse post into our common post shape. */
export function normalizePost(post, ctx) {
  const { baseUrl, topicSlug, topicId } = ctx;
  const text = stripHtml(post.cooked || post.raw || "");
  return {
    id: post.id,
    postNumber: post.post_number,
    author: post.username || post.name || null,
    createdAt: post.created_at || null,
    updatedAt: post.updated_at || null,
    url: `${baseUrl}/t/${topicSlug}/${topicId}/${post.post_number}`,
    text,
    excerpt: truncate(text, 280),
  };
}

/**
 * Create a Discourse adapter.
 * @param {object} cfg
 * @param {string} [cfg.baseUrl]  Forum root, e.g. https://forum.example.com
 * @param {string} [cfg.category] Category path/slug or id (optional)
 * @param {object} [cfg.mock]     Preloaded JSON (latest.json or topic.json) for offline use
 * @param {object} [cfg.httpOpts] Passed through to fetchJson
 */
export function createDiscourseAdapter(cfg = {}) {
  const { baseUrl, category, mock, httpOpts = {} } = cfg;
  const root = (baseUrl || "").replace(/\/+$/, "");
  let categoriesById = new Map();

  const get = async (path) => {
    if (mock) return mock; // single-file offline mode
    return fetchJson(root + path, httpOpts);
  };

  async function ensureCategories() {
    if (mock || categoriesById.size) return;
    try {
      const data = await get("/categories.json");
      const list = data?.category_list?.categories || [];
      categoriesById = new Map(list.map((c) => [c.id, c.name]));
    } catch {
      /* categories are a nice-to-have; ignore failures */
    }
  }

  function listPath(page) {
    if (category) {
      // Accept "slug", "slug/123", or "123".
      const c = String(category).replace(/^\/+|\/+$/g, "");
      return `/c/${c}.json?page=${page}`;
    }
    return `/latest.json?page=${page}`;
  }

  return {
    name: "discourse",

    /** Fetch one page of the thread list. Discourse latest/category lists are
     *  sorted by recent activity, so callers can early-stop once they pass the
     *  date window. */
    async fetchThreadPage(page = 0) {
      await ensureCategories();
      const data = await get(listPath(page));
      const tl = data.topic_list || {};
      const usersById = new Map((data.users || []).map((u) => [u.id, u]));
      const ctx = { baseUrl: root, usersById, categoriesById };
      const threads = (tl.topics || [])
        .filter((t) => !t.pinned) // pinned/announcement topics aren't "recent activity"
        .map((t) => normalizeTopic(t, ctx));
      return {
        threads,
        hasMore: !!tl.more_topics_url && (tl.topics || []).length > 0,
        sortedByActivity: true,
      };
    },

    /** Fetch a single topic plus all of its posts. */
    async fetchThreadWithPosts(idOrUrl, { maxPosts = 1000 } = {}) {
      const id = String(idOrUrl).match(/(\d+)(?:\/?\d*)?$/)?.[1] || idOrUrl;
      const data = await get(`/t/${id}.json`);
      const slug = data.slug;
      const topicId = data.id;
      const ctx = { baseUrl: root, topicSlug: slug, topicId };

      const stream = data.post_stream?.stream || [];
      const have = new Map(
        (data.post_stream?.posts || []).map((p) => [p.id, p])
      );

      // Fetch any post ids not already in the first batch, in chunks.
      const missing = stream.filter((pid) => !have.has(pid)).slice(0, maxPosts);
      for (let i = 0; i < missing.length; i += 20) {
        const chunk = missing.slice(i, i + 20);
        const qs = chunk.map((pid) => `post_ids[]=${pid}`).join("&");
        try {
          const more = await get(`/t/${topicId}/posts.json?${qs}`);
          for (const p of more.post_stream?.posts || []) have.set(p.id, p);
        } catch {
          break; // partial is fine; we filter by date anyway
        }
      }

      const posts = stream
        .map((pid) => have.get(pid))
        .filter(Boolean)
        .map((p) => normalizePost(p, ctx));

      const thread = {
        id: topicId,
        title: data.fancy_title || data.title,
        url: `${root}/t/${slug}/${topicId}`,
        author: posts[0]?.author || null,
        createdAt: data.created_at || posts[0]?.createdAt || null,
        category: categoriesById.get(data.category_id) || null,
        views: data.views ?? null,
      };
      return { thread, posts };
    },
  };
}
