// Sends the same requests to the Node backend and the Rust backend and diffs
// the JSON responses. Both must use the same database.
//
//   node backend-rs/scripts/parity.mjs [nodeUrl] [rustUrl]
//
// Writes test rows for the users parity-node-* / parity-rust-*.

const NODE = process.argv[2] || "http://localhost:3001";
const RUST = process.argv[3] || "http://localhost:3002";
const IGNORE_KEYS = new Set(["timestamp"]);

let failures = 0;
let passes = 0;

function diff(a, b, path = "$") {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9 ? [] : [`${path}: ${a} != ${b}`];
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return a === b ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
  }
  if (Array.isArray(a) !== Array.isArray(b)) return [`${path}: array vs object`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    if (IGNORE_KEYS.has(k)) {
      if ((k in a) !== (k in b)) out.push(`${path}.${k}: present in only one`);
      continue;
    }
    if (!(k in a)) out.push(`${path}.${k}: missing in node`);
    else if (!(k in b)) out.push(`${path}.${k}: missing in rust`);
    else out.push(...diff(a[k], b[k], `${path}.${k}`));
  }
  return out;
}

async function call(base, path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const post = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Same request to both; `rewrite` maps the node-side request to the rust one
async function compare(name, path, options, { rewrite, normalize } = {}) {
  const [n, r] = await Promise.all([
    call(NODE, path, options),
    call(RUST, rewrite?.path ?? path, rewrite?.options ?? options),
  ]);
  const nb = normalize ? normalize(n.body, "node") : n.body;
  const rb = normalize ? normalize(r.body, "rust") : r.body;
  const problems = [];
  if (n.status !== r.status) problems.push(`status ${n.status} != ${r.status}`);
  problems.push(...diff(nb, rb));
  if (problems.length) {
    failures++;
    console.log(`FAIL ${name}`);
    problems.slice(0, 10).forEach((p) => console.log(`     ${p}`));
  } else {
    passes++;
    console.log(`ok   ${name} (${n.status})`);
  }
  return { n, r };
}

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

// Generate today's location via Rust first, so Node reads Rust's row
const first = await call(RUST, "/api/daily-challenge");
console.log(`rust generated today's challenge: ${first.status}`, first.body.hints);

await compare("health", "/api/health");
await compare("days", "/api/days");
await compare("daily-challenge (today)", "/api/daily-challenge");
await compare("daily-challenge (explicit date)", `/api/daily-challenge?date=${today}`);
await compare("daily-challenge (empty date)", "/api/daily-challenge?date=");
await compare("daily-challenge (missing past date)", "/api/daily-challenge?date=2020-01-01");
await compare("daily-challenge (garbage date)", "/api/daily-challenge?date=notadate");

// Find the answer by guessing far away; the response reveals nothing, so read
// it from a winning guess: binary search isn't needed, the DB has it.
const { execSync } = await import("node:child_process");
const [ansLat, ansLng] = execSync(
  `docker exec locodle-pg-rs psql -U locodle -d locodle -At -F, -c "SELECT lat, lng FROM locations WHERE game_date = '${today}' AND is_daily_challenge"`
)
  .toString()
  .trim()
  .split(",")
  .map(Number);
console.log(`answer at ${ansLat}, ${ansLng}`);

await compare("guess: missing", "/api/guess", post({ date: today }));
await compare("guess: invalid JSON", "/api/guess", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{nope",
}, { normalize: (b, side) => (side === "node" ? { error: "Invalid JSON body" } : b) });
await compare("guess: guest, named", "/api/guess", post({
  guess: { name: "Paris, France", lat: 48.8566, lng: 2.3522 },
  date: today,
  guessCount: 1,
}));
await compare("guess: guest, map click", "/api/guess", post({
  guess: { name: "-33.8688, 151.2093", lat: -33.8688, lng: 151.2093 },
  date: today,
}));
await compare("guess: guest, no name", "/api/guess", post({
  guess: { lat: 10.5, lng: -20.25 },
}));
await compare("guess: guest, win", "/api/guess", post({
  guess: { name: "Right here", lat: ansLat + 0.01, lng: ansLng - 0.01 },
  date: today,
}));
await compare("guess: antipode (negative score)", "/api/guess", post({
  guess: { name: "Far", lat: -ansLat, lng: ansLng > 0 ? ansLng - 180 : ansLng + 180 },
  date: today,
}));
await compare("guess: past date with no challenge", "/api/guess", post({
  guess: { name: "x", lat: 1, lng: 1 },
  date: "2020-01-01",
}));

// Logged-in players: separate users per backend, then compare their stats
const run = Date.now().toString(36);
const users = { node: `parity-node-${run}`, rust: `parity-rust-${run}` };
const asUser = (side, body) => ({ ...body, discord_user_id: users[side], username: `${side}-player`, avatar: "abc", guild_id: `guild-${side}-${run}` });
const sameUser = (body) => ({
  options: post(asUser("node", body)),
  rewrite: { options: post(asUser("rust", body)) },
});

for (const [i, g] of [
  { name: "Paris, France", lat: 48.8566, lng: 2.3522, mode: "easy" },
  { name: "12.3456, 65.4321", lat: 12.3456, lng: 65.4321, mode: "hard" },
  { name: "Winner", lat: ansLat, lng: ansLng, mode: "hard" },
].entries()) {
  const body = { guess: { name: g.name, lat: g.lat, lng: g.lng }, date: today, guessCount: i + 1, gameMode: g.mode };
  const { options, rewrite } = sameUser(body);
  await compare(`guess: user #${i + 1} (${g.mode})`, "/api/guess", options, {
    rewrite: { options: rewrite.options },
  });
}

// Let the background geocode renames land
await new Promise((r) => setTimeout(r, 4000));

const strip = (b, side) =>
  JSON.parse(JSON.stringify(b).replaceAll(users[side], "USER").replaceAll(`${side}-player`, "PLAYER"));
await compare("user stats", `/api/user/${users.node}/stats`, {}, {
  rewrite: { path: `/api/user/${users.rust}/stats` },
  normalize: strip,
});
await compare("user stats (unknown user)", "/api/user/nobody-here/stats");
await compare("user guesses", `/api/user/${users.node}/guesses/${today}`, {}, {
  rewrite: { path: `/api/user/${users.rust}/guesses/${today}` },
  normalize: strip,
});
const stats = await call(NODE, `/api/user/${users.node}/stats`);
const jsDate = stats.body.recentGames?.[0]?.date;
console.log(`     recentGames date as returned: ${jsDate}`);
await compare("user guesses (ISO-style date from recentGames)", `/api/user/${users.node}/guesses/${jsDate}`, {}, {
  rewrite: { path: `/api/user/${users.rust}/guesses/${jsDate}` },
  normalize: strip,
});

const dbCheck = execSync(
  `docker exec locodle-pg-rs psql -U locodle -d locodle -At -c "SELECT user_id, guess_number, lat, lng, location_name, distance, score, direction, game_mode FROM user_guesses WHERE user_id LIKE 'parity-%-${run}' ORDER BY guess_number, user_id"`
).toString();
console.log("user_guesses rows:\n" + dbCheck.replaceAll(run, "RUN"));
console.log(execSync(
  `docker exec locodle-pg-rs psql -U locodle -d locodle -At -c "SELECT user_id, guild_id, date, score, guesses_count, won, game_mode, easy_guesses_count FROM daily_results WHERE user_id LIKE 'parity-%-${run}' ORDER BY user_id"`
).toString().replaceAll(run, "RUN"));

await compare("geocode", "/api/geocode?lat=48.8566&lng=2.3522");
await compare("geocode: invalid", "/api/geocode?lat=95&lng=2");
await compare("geocode: missing", "/api/geocode");
await compare("analytics (no secret)", "/api/analytics", post({ event_name: "x", params: {} }));
await compare("post-result-message: missing", "/api/post-result-message", post({}));
await compare("post-result-message: bot off", "/api/post-result-message", post({ channelId: "123", content: "hi" }));
await compare("token: missing code", "/api/token", post({}));

const tile = await Promise.all([NODE, RUST].map((b) => fetch(`${b}/api/tiles/3/2/3`)));
for (const [i, t] of tile.entries()) {
  const buf = await t.arrayBuffer();
  console.log(`     tile via ${i ? "rust" : "node"}: ${t.status} ${t.headers.get("content-type")} ${buf.byteLength}B cache=${t.headers.get("cache-control")}`);
}

for (const origin of ["https://123.discordsays.com", "https://locodle.com", "https://evil.example"]) {
  const res = await Promise.all([NODE, RUST].map((b) =>
    fetch(`${b}/api/guess`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } })
  ));
  const [a, b] = res.map((r) => r.headers.get("access-control-allow-origin"));
  const ok = a === b;
  ok ? passes++ : failures++;
  console.log(`${ok ? "ok  " : "FAIL"} CORS ${origin}: node=${a} rust=${b}`);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
