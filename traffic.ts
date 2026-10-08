// Mock traffic generator: one plain TypeScript file, run with Bun.
//
//   bun traffic.ts
//   BASE_URL=http://<host>:3000 RATE=100 DURATION=300 bun traffic.ts
//
// Open model: requests are started at a fixed RATE per second whether or not earlier
// ones have finished, so the offered load stays constant while the API slows down
// (for example during a migration). A line is printed every second so you can see
// the effect of each phase live.

export {}; // marks this file as a module so top-level await typechecks

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

const RATE = num("RATE", 50); // requests per second
const DURATION_S = num("DURATION", 60); // seconds
const USERS = Math.max(1, num("USERS", 10)); // users created before the run
const WRITE_RATIO = num("WRITE_RATIO", 0.2); // share of POST /posts
const LIST_RATIO = num("LIST_RATIO", 0.4); // share of GET /posts, the rest is GET /posts/:id
const TIMEOUT_MS = num("TIMEOUT_MS", 5000);
const MAX_ERROR_RATE = num("MAX_ERROR_RATE", 0.01); // exit code 1 above this
const P95_MS = num("P95_MS", 500); // exit code 1 above this

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
}

// ---------- setup: create users and a few posts ----------

async function api(
  method: string,
  path: string,
  expected: number,
  opts: { token?: string; body?: unknown } = {},
): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status !== expected) {
    throw new Error(`${method} ${path} -> ${res.status} (expected ${expected}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const tokens: string[] = [];
const postIds: string[] = [];

async function setup(): Promise<void> {
  const runId = Date.now();
  await Promise.all(
    Array.from({ length: USERS }, async (_, i) => {
      const email = `traffic-${runId}-${i}@example.com`;
      const password = "traffic-password-123";
      await api("POST", "/auth/signup", 201, { body: { name: `traffic user ${i}`, email, password } });
      const { token } = await api("POST", "/auth/login", 200, { body: { email, password } });
      tokens.push(token);
      for (let p = 0; p < 5; p++) {
        const post = await api("POST", "/posts", 201, {
          token,
          body: { title: `seed ${i}-${p}`, content: "seed content" },
        });
        postIds.push(post.id);
      }
    }),
  );
}

// ---------- measurement ----------

interface RouteStats {
  count: number;
  errors: number;
  lat: number[];
}
const routes = new Map<string, RouteStats>();
const statusCounts = new Map<number, number>(); // 0 = network error or timeout
let sent = 0;
let inFlight = 0;
let win = { done: 0, errors: 0, lat: [] as number[] };

function record(route: string, status: number, expected: number, ms: number): void {
  const ok = status === expected;
  const s = routes.get(route) ?? { count: 0, errors: 0, lat: [] };
  s.count++;
  if (!ok) s.errors++;
  s.lat.push(ms);
  routes.set(route, s);
  statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  win.done++;
  if (!ok) win.errors++;
  win.lat.push(ms);
}

function fire(): void {
  const r = Math.random();
  let route: string;
  let url: string;
  let init: RequestInit;
  let expected = 200;

  if (r < WRITE_RATIO) {
    route = "POST /posts";
    url = `${BASE_URL}/posts`;
    expected = 201;
    init = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pick(tokens)}` },
      body: JSON.stringify({ title: `load ${sent}`, content: "x".repeat(200) }),
    };
  } else if (r < WRITE_RATIO + LIST_RATIO) {
    route = "GET /posts";
    url = `${BASE_URL}/posts?limit=20`;
    init = { method: "GET" };
  } else {
    route = "GET /posts/:id";
    url = `${BASE_URL}/posts/${pick(postIds)}`;
    init = { method: "GET" };
  }

  sent++;
  inFlight++;
  const t0 = performance.now();
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then(async (res) => {
      await res.arrayBuffer();
      return res.status;
    })
    .catch(() => 0)
    .then((status) => {
      inFlight--;
      record(route, status, expected, performance.now() - t0);
    });
}

function printWindow(second: number): void {
  const lat = win.lat.sort((a, b) => a - b);
  console.log(
    `t=${String(second).padStart(4)}s  done=${String(win.done).padStart(5)}  ` +
      `errors=${String(win.errors).padStart(4)}  p50=${Math.round(percentile(lat, 0.5))}ms  ` +
      `p95=${Math.round(percentile(lat, 0.95))}ms  max=${Math.round(lat[lat.length - 1] ?? 0)}ms  ` +
      `inflight=${inFlight}`,
  );
  win = { done: 0, errors: 0, lat: [] };
}

// ---------- run ----------

console.log(`target ${BASE_URL}  rate=${RATE}/s  duration=${DURATION_S}s  users=${USERS}`);
console.log("setting up users and seed posts...");
try {
  await setup();
} catch (e) {
  console.error(`setup failed: ${e instanceof Error ? e.message : String(e)}`);
  console.error(`Is the API running at ${BASE_URL} and is the schema applied?`);
  process.exit(1);
}
console.log(`ready: ${tokens.length} users, ${postIds.length} posts. Sending traffic.\n`);

let stopRequested = false;
process.on("SIGINT", () => {
  stopRequested = true;
});

const start = performance.now();
let lastPrint = start;
let printed = 0;

await new Promise<void>((resolve) => {
  const timer = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - start) / 1000;
    const target = Math.floor(Math.min(elapsed, DURATION_S) * RATE);
    while (sent < target) fire();

    if (now - lastPrint >= 1000) {
      printWindow(++printed);
      lastPrint += 1000;
    }
    if (elapsed >= DURATION_S || stopRequested) {
      clearInterval(timer);
      resolve();
    }
  }, 10);
});

const drainStart = performance.now();
while (inFlight > 0 && performance.now() - drainStart < TIMEOUT_MS + 1000) await sleep(50);
if (win.done > 0) printWindow(printed + 1);

// ---------- summary ----------

const all: number[] = [];
let total = 0;
let totalErrors = 0;
const table: Record<string, Record<string, number>> = {};
for (const [route, s] of routes) {
  const lat = s.lat.sort((a, b) => a - b);
  all.push(...lat);
  total += s.count;
  totalErrors += s.errors;
  table[route] = {
    count: s.count,
    errors: s.errors,
    p50_ms: Math.round(percentile(lat, 0.5)),
    p95_ms: Math.round(percentile(lat, 0.95)),
    p99_ms: Math.round(percentile(lat, 0.99)),
    max_ms: Math.round(lat[lat.length - 1] ?? 0),
  };
}
all.sort((a, b) => a - b);
const errorRate = total === 0 ? 1 : totalErrors / total;
const p95 = percentile(all, 0.95);

console.log("\n=== summary ===");
console.table(table);
console.log("status codes:", Object.fromEntries([...statusCounts].sort((a, b) => a[0] - b[0])));
console.log(
  `sent=${sent} completed=${total} errors=${totalErrors} (${(errorRate * 100).toFixed(2)}%) ` +
    `p95=${Math.round(p95)}ms  still in flight=${inFlight}`,
);

const failed = errorRate > MAX_ERROR_RATE || p95 > P95_MS;
console.log(failed ? "RESULT: FAIL (error rate or p95 above threshold)" : "RESULT: OK");
process.exit(failed ? 1 : 0);
