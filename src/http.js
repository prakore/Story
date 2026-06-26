// Minimal, dependency-free HTTP helper built on Node's global fetch.
//
// Notes on proxies (relevant in sandboxed/CI environments):
//   Node's built-in fetch only honors HTTPS_PROXY when NODE_USE_ENV_PROXY=1
//   (Node >= 22.21). The CLI sets that automatically, but we also document it.

const DEFAULT_HEADERS = {
  // A descriptive, honest User-Agent. Many forums rate-limit or block blank UAs.
  "User-Agent":
    "forum-thread-extractor/1.0 (+https://github.com/; polite educational scraper)",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch JSON with timeout, polite delay, and exponential-backoff retries.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=20000]
 * @param {number} [opts.retries=3]
 * @param {object} [opts.headers]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, opts = {}) {
  const { timeoutMs = 20000, retries = 3, headers = {} } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { ...DEFAULT_HEADERS, ...headers },
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) {
        // Transient: back off and retry.
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      if (!res.ok) {
        // 4xx (e.g. 403 egress-policy denial, 404): not worth retrying.
        const body = await res.text().catch(() => "");
        const err = new Error(
          `HTTP ${res.status} ${res.statusText} for ${url}` +
            (body ? `\n${body.slice(0, 300)}` : "")
        );
        err.status = res.status;
        err.fatal = true;
        throw err;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.fatal || attempt === retries) break;
      const backoff = 500 * 2 ** attempt; // 0.5s, 1s, 2s, ...
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
