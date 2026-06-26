import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createDiscourseAdapter } from "../src/discourse.js";
import {
  collectThreads,
  collectThreadPosts,
  cutoffDate,
} from "../src/extract.js";
import { renderHtml, buildIndex } from "../src/render.js";

const NOW = new Date("2026-06-26T00:00:00.000Z");
const fx = (name) =>
  fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

const loadLatest = async () =>
  JSON.parse(await readFile(fx("cars-latest.json"), "utf8"));
const loadTopic = async () =>
  JSON.parse(await readFile(fx("cars-topic.json"), "utf8"));

test("cutoffDate subtracts whole months", () => {
  const c = cutoffDate(3, new Date("2026-06-26T00:00:00Z"));
  assert.equal(c.toISOString().slice(0, 10), "2026-03-26");
});

test("collectThreads keeps only last-3-months, drops pinned, newest first", async () => {
  const adapter = createDiscourseAdapter({
    baseUrl: "https://forum.example.com",
    mock: await loadLatest(),
  });
  const { threads, cutoff } = await collectThreads(adapter, {
    months: 3,
    now: NOW,
  });

  // 101..105 are inside the window; 100 is pinned, 106/107 are older.
  assert.deepEqual(
    threads.map((t) => t.id),
    [101, 102, 103, 104, 105]
  );
  // Sorted by activity, newest first.
  assert.equal(threads[0].id, 101);
  assert.equal(threads.at(-1).id, 105);
  // Every kept thread is within the window.
  for (const t of threads) {
    assert.ok(new Date(t.lastActivity) >= cutoff, `${t.id} within window`);
  }
});

test("normalized threads carry useful, searchable fields", async () => {
  const adapter = createDiscourseAdapter({
    baseUrl: "https://forum.example.com",
    mock: await loadLatest(),
  });
  const { threads } = await collectThreads(adapter, { months: 3, now: NOW });
  const civic = threads.find((t) => t.id === 101);
  assert.equal(civic.author, "carfan_dave");
  assert.equal(civic.url, "https://forum.example.com/t/2026-honda-civic-long-term-review/101");
  assert.equal(civic.replies, 23);
  assert.ok(civic.excerpt.length > 0);
});

test("date-field=created changes which threads qualify", async () => {
  const adapter = createDiscourseAdapter({ mock: await loadLatest() });
  const { threads } = await collectThreads(adapter, {
    months: 3,
    now: NOW,
    dateField: "created",
  });
  // 105 was created 2026-03-28 (in) but 106 created 2026-01-10 (out).
  const ids = threads.map((t) => t.id).sort();
  assert.ok(ids.includes(105));
  assert.ok(!ids.includes(106));
});

test("collectThreadPosts filters a single thread's posts by date", async () => {
  const adapter = createDiscourseAdapter({
    baseUrl: "https://forum.example.com",
    mock: await loadTopic(),
  });
  const { posts, totalPosts, thread } = await collectThreadPosts(
    adapter,
    102,
    { months: 3, now: NOW }
  );
  assert.equal(totalPosts, 5);
  // Posts 3,4,5 are within 3 months of 2026-06-26; 1,2 are older.
  assert.deepEqual(
    posts.map((p) => p.postNumber).sort(),
    [3, 4, 5]
  );
  // HTML is stripped to plain text.
  assert.ok(!/[<>]/.test(posts[0].text));
  assert.match(thread.title, /Model 3 Highland/);
});

test("renderHtml embeds data and is self-contained", async () => {
  const adapter = createDiscourseAdapter({ mock: await loadLatest() });
  const { threads, cutoff, dateField } = await collectThreads(adapter, {
    months: 3,
    now: NOW,
  });
  const html = renderHtml(
    buildIndex({
      source: "test",
      dateField,
      cutoff,
      months: 3,
      threads,
    })
  );
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Honda Civic/);
  assert.ok(!/<script src=/.test(html), "no external scripts");
  assert.ok(!html.includes("</script><script"), "single inline data+logic");
});
