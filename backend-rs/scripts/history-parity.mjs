// Read-only check that every past day is listed and playable the same way on
// both backends, and every player's stats and per-day history match.
// Guest guesses (no discord_user_id) don't write to the database.
//
//   node backend-rs/scripts/history-parity.mjs <nodeUrl> <rustUrl> <psql command prefix>
// e.g.
//   node backend-rs/scripts/history-parity.mjs http://localhost:3001 http://localhost:3002 \
//     "docker exec locodle-pg-rs psql -U locodle -d locodle"

import { execSync } from "node:child_process";

const [NODE, RUST, PSQL] = process.argv.slice(2);
const sql = (q) =>
  execSync(`${PSQL} -At -F "|" -c "${q}"`, { maxBuffer: 1 << 28 })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|"));

const randomIp = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
async function call(base, path, body) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Real-IP": randomIp() },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

function diff(a, b, path = "$") {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9 ? [] : [`${path}: ${a} != ${b}`];
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return a === b ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "timestamp" && path.split(".").length <= 1) continue; // "now" in guess responses
    if (!(k in a) || !(k in b)) out.push(`${path}.${k}: only in ${k in a ? "node" : "rust"}`);
    else out.push(...diff(a[k], b[k], `${path}.${k}`));
  }
  return out;
}

const counts = { ok: 0, fail: 0 };
const failures = [];
async function check(name, path, body) {
  const [n, r] = await Promise.all([call(NODE, path, body), call(RUST, path, body)]);
  const problems = n.status !== r.status ? [`status ${n.status} != ${r.status}`] : diff(n.body, r.body);
  if (problems.length) {
    counts.fail++;
    failures.push(`${name}: ${problems.slice(0, 3).join("; ")}`);
  } else counts.ok++;
  return r;
}

// 1. Every challenge day in the database is listed
const dbDays = sql(
  "SELECT TO_CHAR(game_date, 'YYYY-MM-DD'), lat::float8, lng::float8, name FROM locations WHERE is_active AND is_daily_challenge ORDER BY game_date DESC"
);
const days = await check("days", "/api/days");
const listed = new Set(days.body.dates);
const missing = dbDays.filter(([d]) => !listed.has(d));
console.log(`challenge days in DB: ${dbDays.length}, listed by /api/days: ${listed.size}, missing: ${missing.length}`);
if (missing.length) failures.push(`days missing from /api/days: ${missing.map((m) => m[0]).join(", ")}`);

// 2. Every day loads and plays identically (a miss and a win, as a guest)
let wins = 0;
for (const [date, lat, lng, name] of dbDays) {
  const r = await check(`challenge ${date}`, `/api/daily-challenge?date=${date}`);
  if (r.status !== 200) failures.push(`challenge ${date} returned ${r.status} on rust`);
  await check(`miss ${date}`, "/api/guess", { guess: { name: "Far away", lat: -Number(lat) / 2, lng: Number(lng) > 0 ? Number(lng) - 170 : Number(lng) + 170 }, date, guessCount: 1 });
  const win = await check(`win ${date}`, "/api/guess", { guess: { name: "Spot on", lat: Number(lat) + 0.01, lng: Number(lng) }, date, guessCount: 2 });
  if (win.body?.won && win.body?.answer?.name === name) wins++;
  else failures.push(`win ${date}: rust did not reveal ${name}`);
}
console.log(`days playable and winnable on rust: ${wins}/${dbDays.length}`);

// 3. Every player's stats and per-day guess history
const users = sql("SELECT DISTINCT user_id FROM user_guesses UNION SELECT DISTINCT user_id FROM daily_results").map((r) => r[0]);
let histories = 0;
for (const u of users) {
  const stats = await check(`stats ${u}`, `/api/user/${u}/stats`);
  for (const g of stats.body?.recentGames ?? []) {
    await check(`guesses ${u} ${g.date} (as sent by stats)`, `/api/user/${u}/guesses/${g.date}`);
  }
  for (const [date] of sql(`SELECT DISTINCT TO_CHAR(date, 'YYYY-MM-DD') FROM user_guesses WHERE user_id = '${u}'`)) {
    await check(`guesses ${u} ${date}`, `/api/user/${u}/guesses/${date}`);
    histories++;
  }
}
console.log(`players checked: ${users.length}, player-day histories compared: ${histories}`);

console.log(`\n${counts.ok} responses identical, ${counts.fail} different`);
failures.slice(0, 20).forEach((f) => console.log(`  FAIL ${f}`));
process.exit(failures.length ? 1 : 0);
