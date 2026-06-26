// Core extraction logic: turn an adapter + a date window into a clean list of
// threads (or one thread's posts), filtered to the last N months.

/** Return an ISO cutoff date that is `months` before `now`. */
export function cutoffDate(months, now = new Date()) {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

const toDate = (v) => (v ? new Date(v) : null);

/**
 * Collect threads active (or created) within the last N months.
 *
 * @param {object} adapter            an adapter from createDiscourseAdapter()
 * @param {object} opts
 * @param {number} [opts.months=3]
 * @param {Date}   [opts.now]
 * @param {"activity"|"created"} [opts.dateField="activity"]
 * @param {number} [opts.maxPages=10]
 * @param {(msg:string)=>void} [opts.onProgress]
 */
export async function collectThreads(adapter, opts = {}) {
  const {
    months = 3,
    now = new Date(),
    dateField = "activity",
    maxPages = 10,
    onProgress = () => {},
  } = opts;

  const cutoff = cutoffDate(months, now);
  const fieldKey = dateField === "created" ? "createdAt" : "lastActivity";
  const out = [];
  const seen = new Set();

  for (let page = 0; page < maxPages; page++) {
    const { threads, hasMore, sortedByActivity } = await adapter.fetchThreadPage(
      page
    );
    if (!threads.length) break;

    let oldestOnPage = null;
    for (const t of threads) {
      const when = toDate(t[fieldKey]);
      if (when && (!oldestOnPage || when < oldestOnPage)) oldestOnPage = when;
      if (when && when >= cutoff && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    onProgress(
      `page ${page + 1}: ${threads.length} topics, ${out.length} within window`
    );

    // Early-stop: when the list is activity-sorted and we're filtering by
    // activity, once a whole page is older than the cutoff nothing newer remains.
    const canEarlyStop = sortedByActivity && dateField === "activity";
    if (canEarlyStop && oldestOnPage && oldestOnPage < cutoff) break;
    if (!hasMore) break;
  }

  // Newest first.
  out.sort((a, b) => new Date(b[fieldKey]) - new Date(a[fieldKey]));
  return { cutoff, dateField, threads: out };
}

/**
 * Collect a single thread's posts within the last N months.
 */
export async function collectThreadPosts(adapter, idOrUrl, opts = {}) {
  const { months = 3, now = new Date(), maxPosts = 1000 } = opts;
  const cutoff = cutoffDate(months, now);
  const { thread, posts } = await adapter.fetchThreadWithPosts(idOrUrl, {
    maxPosts,
  });
  const recent = posts.filter((p) => {
    const when = toDate(p.createdAt);
    return when && when >= cutoff;
  });
  recent.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { cutoff, thread, posts: recent, totalPosts: posts.length };
}
