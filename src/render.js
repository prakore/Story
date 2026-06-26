// Output renderers: console summary, JSON, and a self-contained searchable
// HTML page (no external assets, works offline by just opening the file).

const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "—");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pad = (s, n) => {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
};

/** Human-readable summary + table for the terminal. */
export function renderConsole({ threads, dateField, cutoff, source }) {
  const lines = [];
  lines.push(`\nForum: ${source}`);
  lines.push(
    `Window: ${dateField} since ${fmtDate(cutoff)}  ·  ${threads.length} threads\n`
  );
  lines.push(
    `  ${pad("DATE", 11)}  ${pad("REPLIES", 8)}  ${pad("AUTHOR", 16)}  TITLE`
  );
  lines.push(`  ${"-".repeat(11)}  ${"-".repeat(8)}  ${"-".repeat(16)}  -----`);
  for (const t of threads) {
    const date = fmtDate(dateField === "created" ? t.createdAt : t.lastActivity);
    lines.push(
      `  ${pad(date, 11)}  ${pad(t.replies ?? "—", 8)}  ${pad(
        t.author || "—",
        16
      )}  ${t.title}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderThreadConsole({ thread, posts, cutoff, totalPosts }) {
  const lines = [];
  lines.push(`\nThread: ${thread.title}`);
  lines.push(`URL:    ${thread.url}`);
  lines.push(
    `Posts since ${fmtDate(cutoff)}: ${posts.length} of ${totalPosts} total\n`
  );
  for (const p of posts) {
    lines.push(
      `  #${p.postNumber}  ${fmtDate(p.createdAt)}  @${p.author || "—"}`
    );
    lines.push(`    ${p.excerpt.replace(/\n/g, "\n    ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Build the searchable index object that we serialize to JSON / embed in HTML. */
export function buildIndex({ source, dateField, cutoff, months, threads }) {
  return {
    source,
    generatedAt: new Date().toISOString(),
    window: { months, dateField, since: new Date(cutoff).toISOString() },
    count: threads.length,
    threads,
  };
}

/**
 * A single self-contained HTML file: embeds the data as JSON and provides a
 * client-side search box (filters by title/author/category/excerpt) plus
 * sortable columns. No network, no build step — just open it in a browser.
 */
export function renderHtml(index) {
  const dataJson = JSON.stringify(index).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Forum threads · ${esc(index.source)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         margin: 0; padding: 24px; max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #777; font-size: 13px; margin-bottom: 16px; }
  .bar { position: sticky; top: 0; padding: 12px 0; background: Canvas;
         display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  input[type=search] { flex: 1 1 280px; padding: 10px 12px; font-size: 15px;
         border: 1px solid #8884; border-radius: 8px; }
  .count { color: #777; font-size: 13px; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #8882;
           vertical-align: top; }
  th { cursor: pointer; user-select: none; font-size: 12px; text-transform: uppercase;
       letter-spacing: .04em; color: #888; white-space: nowrap; }
  th[data-dir]::after { content: " ↕"; opacity: .4; }
  th[data-dir="asc"]::after { content: " ↑"; opacity: 1; }
  th[data-dir="desc"]::after { content: " ↓"; opacity: 1; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.date { white-space: nowrap; color: #777; }
  a { color: inherit; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  .excerpt { color: #888; font-weight: 400; font-size: 13px; margin-top: 2px;
             display: block; max-width: 640px; }
  .tag { font-size: 11px; color: #777; border: 1px solid #8884; border-radius: 999px;
         padding: 1px 8px; }
  mark { background: #ffd54f88; color: inherit; }
</style>
</head>
<body>
<h1>${esc(index.source)}</h1>
<div class="meta">
  Last ${index.window.months} months · by ${esc(index.window.dateField)} ·
  since ${esc(index.window.since.slice(0, 10))} ·
  generated ${esc(index.generatedAt.slice(0, 10))}
</div>
<div class="bar">
  <input id="q" type="search" placeholder="Search title, author, category…" autofocus />
  <span class="count" id="count"></span>
</div>
<table>
  <thead><tr>
    <th data-key="date" data-dir="desc">Date</th>
    <th data-key="replies" class="num">Replies</th>
    <th data-key="views" class="num">Views</th>
    <th data-key="author">Author</th>
    <th data-key="title">Thread</th>
  </tr></thead>
  <tbody id="rows"></tbody>
</table>
<script>
const DATA = ${dataJson};
const field = DATA.window.dateField;
const rows = DATA.threads.map(t => ({
  ...t,
  date: field === "created" ? t.createdAt : t.lastActivity,
  haystack: [t.title, t.author, t.category, t.excerpt].filter(Boolean).join(" ").toLowerCase(),
}));
const tbody = document.getElementById("rows");
const countEl = document.getElementById("count");
const qEl = document.getElementById("q");
let sortKey = "date", sortDir = "desc";

const d = v => v ? new Date(v).toISOString().slice(0,10) : "—";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function hi(text, q) {
  const s = esc(text);
  if (!q) return s;
  try { return s.replace(new RegExp("(" + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + ")", "ig"), "<mark>$1</mark>"); }
  catch { return s; }
}

function render() {
  const q = qEl.value.trim().toLowerCase();
  let list = rows.filter(r => !q || r.haystack.includes(q));
  list.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "date") { x = new Date(x||0); y = new Date(y||0); }
    if (sortKey === "title" || sortKey === "author") { x = (x||"").toLowerCase(); y = (y||"").toLowerCase(); }
    x = x ?? 0; y = y ?? 0;
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });
  countEl.textContent = list.length + " / " + rows.length + " threads";
  tbody.innerHTML = list.map(r => \`
    <tr>
      <td class="date">\${d(r.date)}</td>
      <td class="num">\${r.replies ?? "—"}</td>
      <td class="num">\${r.views ?? "—"}</td>
      <td>\${esc(r.author || "—")}</td>
      <td>
        <a href="\${esc(r.url)}" target="_blank" rel="noopener">\${hi(r.title, q)}</a>
        \${r.category ? '<span class="tag">' + esc(r.category) + '</span>' : ''}
        \${r.excerpt ? '<span class="excerpt">' + hi(r.excerpt, q) + '</span>' : ''}
      </td>
    </tr>\`).join("");
}

qEl.addEventListener("input", render);
document.querySelectorAll("th").forEach(th => th.addEventListener("click", () => {
  const key = th.dataset.key;
  if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
  else { sortKey = key; sortDir = key === "title" || key === "author" ? "asc" : "desc"; }
  document.querySelectorAll("th").forEach(h => h.removeAttribute("data-dir"));
  th.dataset.dir = sortDir;
  render();
}));
render();
</script>
</body>
</html>`;
}
