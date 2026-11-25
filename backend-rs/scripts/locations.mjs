#!/usr/bin/env node
// Location pool maintenance: popularity scoring and candidate discovery.
//
//   node scripts/locations.mjs resolve      match templates without `wikidata` to a Wikipedia article
//   node scripts/locations.mjs score        fetch fame metrics and (re)assign `tier` to every template
//   node scripts/locations.mjs candidates   list popular places from Wikidata that aren't in the pool yet
//                                            (writes scripts/out/candidates.json for review)
//   node scripts/locations.mjs add FILE     append reviewed candidates (a JSON array) to the pool, then run `score`
//
// Fame = 50% Wikipedia language count (Wikidata sitelinks) + 50% English Wikipedia
// pageviews over the last 60 days, each as a percentile within the pool.
// Tiers, ranked within each type: top 35% -> 1 (iconic), next 40% -> 2, rest -> 3 (deep cut).
// Responses are cached in scripts/.wiki-cache.json, so reruns are cheap.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(here, "../data/location_templates.json");
const CACHE_FILE = path.join(here, ".wiki-cache.json");
const OUT_DIR = path.join(here, "out");
const UA = "LocodleDataScript/1.0 (geography game location pool maintenance)";

const TIER1_SHARE = 0.35;
const TIER2_SHARE = 0.4;

// ---------------------------------------------------------------- utilities

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
let cacheDirty = 0;
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  cacheDirty = 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia throttles anonymous clients hard (a 429 locks you out for about a
// minute), so space requests out per host.
const MIN_GAP_MS = { "wikimedia.org": 250, "query.wikidata.org": 3000 };
const nextSlot = new Map();
async function pace(url) {
  const host = new URL(url).host;
  const gap = MIN_GAP_MS[host] ?? 1500;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + gap);
  if (at > now) await sleep(at - now);
}

async function getJson(url, { useCache = true, body } = {}) {
  const key = body ? `${url}#${body}` : url;
  if (useCache && key in cache) return cache[key];
  for (let attempt = 0; ; attempt++) {
    await pace(url);
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
    if (res.status === 404) {
      cache[key] = null;
      return null;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const wait = Number(res.headers.get("retry-after")) || 5 * (attempt + 1);
      console.error(`  ${res.status} from ${new URL(url).host}, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const json = await res.json();
    if (useCache) {
      cache[key] = json;
      if (++cacheDirty >= 10) saveCache();
    }
    return json;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const readTemplates = () => JSON.parse(fs.readFileSync(TEMPLATES, "utf8"));
function writeTemplates(list) {
  // One object per line keeps diffs reviewable.
  const lines = list.map((t) => {
    const o = { type: t.type, name: t.name, lat: t.lat, lng: t.lng, country: t.country };
    if (t.tier != null) o.tier = t.tier;
    if (t.wikidata) o.wikidata = t.wikidata;
    if (t.wiki) o.wiki = t.wiki;
    return "  " + JSON.stringify(o);
  });
  fs.writeFileSync(TEMPLATES, "[\n" + lines.join(",\n") + "\n]\n");
}

// How far a Wikipedia article's coordinates may be from the template's and still count as a match.
const MATCH_KM = { city: 40, landmark: 25, natural: 250 };

// ------------------------------------------------------------------ resolve

async function lookupArticles(params) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
    "&prop=coordinates|pageprops&ppprop=wikibase_item|disambiguation&colimit=max&" +
    new URLSearchParams(params);
  const json = await getJson(url);
  return (json?.query?.pages ?? [])
    .filter((p) => !p.missing && p.pageprops?.wikibase_item && !("disambiguation" in p.pageprops))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

async function resolveOne(t) {
  const max = MATCH_KM[t.type] ?? 50;
  const near = (p) => {
    const c = p.coordinates?.[0];
    return c && distanceKm(t.lat, t.lng, c.lat, c.lon) <= max;
  };
  const attempts = [
    { titles: `${t.name}, ${t.country}` },
    { generator: "search", gsrsearch: t.name, gsrlimit: "8" },
    { generator: "search", gsrsearch: `${t.name} ${t.country}`, gsrlimit: "8" },
  ];
  for (const a of attempts) {
    const hit = (await lookupArticles(a)).find(near);
    if (hit) return { wikidata: hit.pageprops.wikibase_item, title: hit.title };
  }
  return null;
}

// Exact-title lookups, 50 per request. Returns the templates still unmatched.
async function resolveByTitle(todo) {
  const left = [];
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
      "&prop=coordinates|pageprops&ppprop=wikibase_item|disambiguation&colimit=max&" +
      new URLSearchParams({ titles: batch.map((t) => t.name).join("|") });
    const q = (await getJson(url))?.query ?? {};
    // Follow normalization and redirects from the requested name to the final title.
    const hop = new Map([...(q.normalized ?? []), ...(q.redirects ?? [])].map((r) => [r.from, r.to]));
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      let title = t.name;
      for (let n = 0; n < 3 && hop.has(title); n++) title = hop.get(title);
      const p = pages.get(title);
      const c = p?.coordinates?.[0];
      const ok =
        p && !p.missing && p.pageprops?.wikibase_item && !("disambiguation" in p.pageprops) &&
        c && distanceKm(t.lat, t.lng, c.lat, c.lon) <= (MATCH_KM[t.type] ?? 50);
      if (ok) t.wikidata = p.pageprops.wikibase_item;
      else left.push(t);
    }
  }
  return left;
}

async function resolve() {
  const list = readTemplates();
  const all = list.filter((t) => !t.wikidata);
  console.log(`resolving ${all.length} of ${list.length} templates`);
  const todo = await resolveByTitle(all);
  writeTemplates(list);
  console.log(`${all.length - todo.length} matched by title; searching for ${todo.length}`);
  const failed = [];
  await mapLimit(todo, 1, async (t) => {
    const hit = await resolveOne(t);
    if (hit) t.wikidata = hit.wikidata;
    else failed.push(t);
  });
  saveCache();
  writeTemplates(list);

  // Two templates resolving to the same article are the same place.
  const byQ = new Map();
  for (const t of list) if (t.wikidata) byQ.set(t.wikidata, [...(byQ.get(t.wikidata) ?? []), t.name]);
  const dupes = [...byQ].filter(([, names]) => names.length > 1);

  console.log(`resolved ${todo.length - failed.length}, unresolved ${failed.length}`);
  for (const t of failed) console.log(`  unresolved: ${t.name} (${t.country}) ${t.lat},${t.lng}`);
  for (const [q, names] of dupes) console.log(`  same article ${q}: ${names.join(" | ")}`);
}

// -------------------------------------------------------------------- score

// Wikipedia sitelinks only (not Commons, Wikivoyage, Wikiquote, ...).
const NON_WIKIPEDIA = new Set([
  "commonswiki", "specieswiki", "metawiki", "mediawikiwiki", "wikidatawiki", "sourceswiki",
  "wikimaniawiki", "foundationwiki", "incubatorwiki", "outreachwiki", "wikifunctionswiki",
]);

async function entityInfo(qids) {
  const info = {};
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50).join("|");
    const json = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids=${ids}`,
    );
    for (const [q, e] of Object.entries(json.entities ?? {})) {
      const links = e.sitelinks ?? {};
      info[q] = {
        languages: Object.keys(links).filter((k) => k.endsWith("wiki") && !NON_WIKIPEDIA.has(k)).length,
        title: links.enwiki?.title ?? null,
      };
    }
  }
  return info;
}

// English Wikipedia views over the last 60 days, 50 titles per request (the
// per-article REST endpoint takes one title per call and throttles hard).
async function recentViews(titles) {
  const views = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont = {};
    for (;;) {
      const url =
        "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
        "&prop=pageviews&pvipdays=60&" +
        new URLSearchParams({ titles: batch.join("|"), ...cont });
      const json = await getJson(url);
      const q = json?.query ?? {};
      const hop = new Map([...(q.normalized ?? []), ...(q.redirects ?? [])].map((r) => [r.from, r.to]));
      const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
      for (const t of batch) {
        let title = t;
        for (let n = 0; n < 3 && hop.has(title); n++) title = hop.get(title);
        const pv = byTitle.get(title)?.pageviews;
        if (pv) views.set(t, (views.get(t) ?? 0) + Object.values(pv).reduce((s, v) => s + (v ?? 0), 0));
      }
      if (!json?.continue) break;
      cont = json.continue;
    }
  }
  return views;
}

async function metricsFor(qids) {
  const info = await entityInfo([...new Set(qids)]);
  const titles = Object.values(info).map((i) => i.title).filter(Boolean);
  const views = await recentViews(titles);
  for (const i of Object.values(info)) i.views = views.get(i.title) ?? 0;
  saveCache();
  return info;
}

function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  // Midpoint rank so ties share a percentile.
  return values.map((v) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let up = lo;
    while (up < sorted.length && sorted[up] === v) up++;
    return (lo + up) / 2 / sorted.length;
  });
}

function fameScores(rows) {
  const lang = percentiles(rows.map((r) => r.languages));
  const views = percentiles(rows.map((r) => r.views));
  return rows.map((_, i) => 0.5 * lang[i] + 0.5 * views[i]);
}

async function score() {
  const list = readTemplates();
  const missing = list.filter((t) => !t.wikidata);
  if (missing.length) {
    console.warn(`${missing.length} templates have no wikidata id and score as deep cuts (run \`resolve\` or set them by hand):`);
    for (const t of missing) console.warn(`  ${t.name} (${t.country})`);
  }
  const info = await metricsFor(list.map((t) => t.wikidata).filter(Boolean));
  const rows = list.map((t) => ({ t, ...(info[t.wikidata] ?? { languages: 0, views: 0 }) }));
  // English Wikipedia title, used by the server for the post-game photo and summary.
  for (const r of rows) if (r.title) r.t.wiki = r.title;
  const scores = fameScores(rows);
  const order = rows.map((r, i) => [r, scores[i]]).sort((a, b) => b[1] - a[1]);
  // Tier within each type: city articles draw far more readers than landmarks,
  // so one combined ranking would make tier 1 nearly all cities.
  for (const type of new Set(list.map((t) => t.type))) {
    const ofType = order.filter(([r]) => r.t.type === type);
    const n = ofType.length;
    ofType.forEach(([r], rank) => {
      r.t.tier = rank < n * TIER1_SHARE ? 1 : rank < n * (TIER1_SHARE + TIER2_SHARE) ? 2 : 3;
    });
  }
  writeTemplates(list);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = order.map(([r, s]) =>
    [r.t.tier, s.toFixed(3), r.languages, r.views, r.t.type, r.t.name, r.t.country, r.title ?? ""].join("\t"),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "scores.tsv"),
    "tier\tscore\tlangs\tviews\ttype\tname\tcountry\tarticle\n" + report.join("\n") + "\n",
  );
  const count = (tier, type) => list.filter((t) => t.tier === tier && (!type || t.type === type)).length;
  for (const tier of [1, 2, 3]) {
    console.log(`tier ${tier}: ${count(tier)} (city ${count(tier, "city")}, landmark ${count(tier, "landmark")}, natural ${count(tier, "natural")})`);
  }
  console.log(`wrote ${path.join(OUT_DIR, "scores.tsv")}`);
}

// --------------------------------------------------------------- candidates

// [type, minimum Wikipedia languages, SPARQL pattern binding ?item]
const SOURCES = [
  ["city", 90, "?item wdt:P31/wdt:P279* wd:Q515 ; wdt:P1082 ?pop . FILTER(?pop >= 250000)"],
  ["city", 70, "?item wdt:P31 wd:Q5119 ."], // capitals
  // big city, city with millions, metropolis, city of the US (Rome, Tokyo, Los Angeles
  // aren't direct instances of "city")
  ["city", 100, "VALUES ?k { wd:Q1549591 wd:Q1637706 wd:Q200250 wd:Q1093829 } ?item wdt:P31 ?k ."],
  ["landmark", 35, "?item wdt:P1435 wd:Q9259 ."], // UNESCO World Heritage Site
  ["natural", 30, "?item wdt:P31 wd:Q46169 ."], // national park
  // waterfall, canyon, cave, volcano, beach, valley, glacier
  ["natural", 35, "VALUES ?k { wd:Q34038 wd:Q150784 wd:Q35509 wd:Q8072 wd:Q40080 wd:Q39816 wd:Q35666 } ?item wdt:P31 ?k ."],
  ["natural", 60, "?item wdt:P31 wd:Q23397 ."], // lake
  ["natural", 60, "?item wdt:P31 wd:Q8502 ."], // mountain
  ["natural", 45, "?item wdt:P31 wd:Q23442 ."], // island
  // tower, bridge, church, cathedral, palace, castle, tourist attraction, monument, statue,
  // temple, archaeological site, museum
  ["landmark", 45, "VALUES ?k { wd:Q12518 wd:Q12280 wd:Q16970 wd:Q2977 wd:Q16560 wd:Q23413 wd:Q570116 wd:Q4989906 wd:Q179700 wd:Q44539 wd:Q839954 wd:Q33506 } ?item wdt:P31 ?k ."],
];

async function sparql(query) {
  const json = await getJson("https://query.wikidata.org/sparql?format=json", {
    body: "query=" + encodeURIComponent(query),
  });
  return json.results.bindings;
}

async function candidates() {
  const list = readTemplates();
  const known = new Set(list.map((t) => t.wikidata));
  const found = new Map();
  for (const [type, minLangs, pattern] of SOURCES) {
    const rows = await sparql(`
      SELECT ?item ?itemLabel ?countryLabel ?coord ?langs WHERE {
        ${pattern}
        ?item wikibase:sitelinks ?langs . FILTER(?langs >= ${minLangs})
        ?item wdt:P625 ?coord ; wdt:P17 ?country .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`);
    let added = 0;
    for (const r of rows) {
      const q = r.item.value.split("/").pop();
      if (known.has(q) || found.has(q)) continue;
      const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(r.coord.value);
      if (!m) continue;
      found.set(q, {
        type,
        name: r.itemLabel.value,
        lat: +(+m[2]).toFixed(4),
        lng: +(+m[1]).toFixed(4),
        country: r.countryLabel.value,
        wikidata: q,
      });
      added++;
    }
    console.log(`${type} ${pattern.slice(0, 60)}...: ${rows.length} rows, ${added} new`);
    saveCache();
  }

  const cands = [...found.values()];
  const info = await metricsFor(cands.map((c) => c.wikidata));
  // Score candidates against the existing pool so percentiles are comparable.
  const poolInfo = await metricsFor(list.map((t) => t.wikidata).filter(Boolean));
  const rows = [
    ...list.filter((t) => t.wikidata).map((t) => ({ ...poolInfo[t.wikidata], pool: true })),
    ...cands.map((c) => ({ ...info[c.wikidata], c })),
  ];
  const scores = fameScores(rows);
  const scored = rows
    .map((r, i) => ({ ...r, score: scores[i] }))
    .filter((r) => r.c)
    .map((r) => {
      const nearest = list.reduce(
        (best, t) => {
          const d = distanceKm(r.c.lat, r.c.lng, t.lat, t.lng);
          return d < best.km ? { km: d, name: t.name } : best;
        },
        { km: Infinity, name: "" },
      );
      return { ...r.c, score: +r.score.toFixed(3), langs: r.languages, views: r.views, title: r.title, nearest: `${nearest.name} (${nearest.km.toFixed(1)} km)` };
    })
    .sort((a, b) => b.score - a.score);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "candidates.json"), JSON.stringify(scored, null, 1));
  console.log(`${scored.length} candidates -> ${path.join(OUT_DIR, "candidates.json")}`);
}

// ---------------------------------------------------------------------- add

function add(file) {
  const list = readTemplates();
  const incoming = JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = new Set(list.map((t) => `${t.name}|${t.country}`));
  const qids = new Set(list.map((t) => t.wikidata));
  let added = 0;
  for (const c of incoming) {
    if (!["city", "landmark", "natural"].includes(c.type)) throw new Error(`bad type for ${c.name}`);
    if (keys.has(`${c.name}|${c.country}`) || qids.has(c.wikidata)) continue;
    list.push({ type: c.type, name: c.name, lat: c.lat, lng: c.lng, country: c.country, wikidata: c.wikidata, wiki: c.title });
    keys.add(`${c.name}|${c.country}`);
    qids.add(c.wikidata);
    added++;
  }
  writeTemplates(list);
  console.log(`added ${added}; pool is now ${list.length}. Run \`score\` to assign tiers.`);
}

// --------------------------------------------------------------------- main

const [cmd, arg] = process.argv.slice(2);
const commands = { resolve, score, candidates, add: () => add(arg) };
if (!commands[cmd]) {
  console.error("usage: node scripts/locations.mjs resolve|score|candidates|add FILE");
  process.exit(1);
}
process.on("SIGINT", () => {
  saveCache();
  process.exit(130);
});
try {
  await commands[cmd]();
} finally {
  saveCache();
}
