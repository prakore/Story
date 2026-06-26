#!/usr/bin/env node
// forum-extract — extract the last N months of forum threads (or one thread's
// posts) and build a searchable index (console + JSON + self-contained HTML).
//
// Make Node's built-in fetch honor HTTPS_PROXY in sandboxed environments.
process.env.NODE_USE_ENV_PROXY ??= "1";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createDiscourseAdapter } from "../src/discourse.js";
import { collectThreads, collectThreadPosts } from "../src/extract.js";
import {
  renderConsole,
  renderThreadConsole,
  renderHtml,
  buildIndex,
} from "../src/render.js";

const HELP = `forum-extract — last N months of forum threads, made searchable

USAGE
  forum-extract <forum-url> [options]
  forum-extract --mock <file.json> [options]

MODES
  (default)              List threads active in the window -> searchable index
  --thread <id|url>      Extract one thread's posts in the window

OPTIONS
  --months <n>           Window size in months            (default 3)
  --category <slug|id>   Restrict to a Discourse category (e.g. "reviews/12")
  --date-field <f>       "activity" (default) or "created"
  --max-pages <n>        Max list pages to fetch           (default 10)
  --limit <n>            Cap rows shown in the console
  --out <prefix>         Write <prefix>.json and <prefix>.html
  --mock <file>          Read a saved Discourse JSON instead of the network
  --now <ISO date>       Override "now" (testing / reproducible windows)
  -h, --help

EXAMPLES
  forum-extract https://forum.example.com --months 3 --out out/forum
  forum-extract https://forum.example.com --category reviews/12 --out out/reviews
  forum-extract https://forum.example.com --thread 12345 --months 3
  forum-extract --mock fixtures/cars-latest.json --now 2026-06-26 --out out/cars

Note: Discourse forums expose JSON by appending .json to any URL, so this tool
targets Discourse for reliability. Point it at a forum's root URL.`;

function parseArgs(argv) {
  const o = {
    months: 3,
    dateField: "activity",
    maxPages: 10,
    _: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-h":
      case "--help": o.help = true; break;
      case "--months": o.months = parseInt(next(), 10); break;
      case "--category": o.category = next(); break;
      case "--date-field": o.dateField = next(); break;
      case "--max-pages": o.maxPages = parseInt(next(), 10); break;
      case "--limit": o.limit = parseInt(next(), 10); break;
      case "--out": o.out = next(); break;
      case "--mock": o.mock = next(); break;
      case "--now": o.now = new Date(next()); break;
      case "--thread": o.thread = next(); break;
      default:
        if (a.startsWith("--")) { console.error(`Unknown option: ${a}`); process.exit(2); }
        o._.push(a);
    }
  }
  return o;
}

async function writeOutputs(prefix, index, html) {
  await mkdir(dirname(prefix) || ".", { recursive: true });
  await writeFile(`${prefix}.json`, JSON.stringify(index, null, 2));
  await writeFile(`${prefix}.html`, html);
  console.error(`\nWrote ${prefix}.json and ${prefix}.html`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o._.length && !o.mock)) {
    console.log(HELP);
    process.exit(o.help ? 0 : 1);
  }

  const baseUrl = o._[0];
  const now = o.now && !isNaN(o.now) ? o.now : new Date();

  let mock;
  if (o.mock) {
    mock = JSON.parse(await readFile(o.mock, "utf8"));
  }
  const source = baseUrl || (o.mock ? `mock:${o.mock}` : "unknown");

  const adapter = createDiscourseAdapter({
    baseUrl: baseUrl || "https://forum.example.com",
    category: o.category,
    mock,
  });

  // Single-thread mode -------------------------------------------------------
  if (o.thread) {
    const res = await collectThreadPosts(adapter, o.thread, {
      months: o.months,
      now,
    });
    console.log(renderThreadConsole(res));
    if (o.out) {
      const index = {
        source,
        generatedAt: new Date().toISOString(),
        window: { months: o.months, since: res.cutoff.toISOString() },
        thread: res.thread,
        totalPosts: res.totalPosts,
        count: res.posts.length,
        posts: res.posts,
      };
      await mkdir(dirname(o.out) || ".", { recursive: true });
      await writeFile(`${o.out}.json`, JSON.stringify(index, null, 2));
      console.error(`\nWrote ${o.out}.json`);
    }
    return;
  }

  // Thread-list mode ---------------------------------------------------------
  const res = await collectThreads(adapter, {
    months: o.months,
    now,
    dateField: o.dateField,
    maxPages: o.maxPages,
    onProgress: (m) => console.error(`  · ${m}`),
  });

  let threads = res.threads;
  if (o.limit) threads = threads.slice(0, o.limit);

  console.log(
    renderConsole({
      threads,
      dateField: res.dateField,
      cutoff: res.cutoff,
      source,
    })
  );

  if (o.out) {
    const index = buildIndex({
      source,
      dateField: res.dateField,
      cutoff: res.cutoff,
      months: o.months,
      threads: res.threads, // full set in the file, not the console-capped view
    });
    await writeOutputs(o.out, index, renderHtml(index));
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  if (err.status === 403) {
    console.error(
      "  (403 = blocked by network egress policy. Run from an environment that\n" +
        "   allows the forum host, or use --mock with a saved JSON file.)"
    );
  }
  process.exit(1);
});
