import { config } from "./config";
import { sql } from "./db";
import { HttpError, json } from "./http";
import { login, signup } from "./routes/auth";
import { createPost, getPost, listPosts } from "./routes/posts";

type Handler = (req: any) => Promise<Response> | Response;

// Turns thrown HttpErrors into JSON responses; anything else is a logged 500.
const wrap =
  (fn: Handler): Handler =>
  async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("unhandled error:", e);
      return json({ error: "Internal server error" }, 500);
    }
  };

const server = Bun.serve({
  port: config.port,
  routes: {
    "/health": () => json({ status: "ok" }),
    "/ready": wrap(async () => {
      await sql`SELECT 1`;
      return json({ status: "ready" });
    }),
    "/auth/signup": { POST: wrap(signup) },
    "/auth/login": { POST: wrap(login) },
    "/posts": { GET: wrap(listPosts), POST: wrap(createPost) },
    "/posts/:id": { GET: wrap(getPost) },
  },
  fetch: () => json({ error: "Not found" }, 404),
});

console.log(`listening on :${server.port}`);

// Graceful shutdown so rolling deploys don't drop in-flight requests.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: draining`);
  await server.stop();
  await sql.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
