import { requireUser } from "../auth";
import { sql } from "../db";
import { HttpError, json, readJson, str } from "../http";

export async function createPost(req: Request): Promise<Response> {
  const userId = await requireUser(req);
  const body = await readJson(req);
  const title = str(body, "title", { max: 200 });
  const content = str(body, "content", { max: 10_000 });

  const rows = await sql`
    INSERT INTO posts (user_id, title, content)
    VALUES (${userId}, ${title}, ${content})
    RETURNING id::text AS id, user_id::text AS user_id, title, content, created_at`;
  return json(rows[0], 201);
}

// Keyset pagination: GET /posts?limit=20&before=<id>  (newest first)
export async function listPosts(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);
  const beforeRaw = url.searchParams.get("before");
  if (beforeRaw !== null && !/^\d+$/.test(beforeRaw)) throw new HttpError(400, "before must be an id");

  const rows =
    beforeRaw === null
      ? await sql`
          SELECT id::text AS id, user_id::text AS user_id, title, content, created_at
          FROM posts ORDER BY id DESC LIMIT ${limit}`
      : await sql`
          SELECT id::text AS id, user_id::text AS user_id, title, content, created_at
          FROM posts WHERE id < ${beforeRaw} ORDER BY id DESC LIMIT ${limit}`;
  const next = rows.length === limit ? rows[rows.length - 1].id : null;
  return json({ data: rows, next_before: next });
}

export async function getPost(req: Request & { params: { id: string } }): Promise<Response> {
  const id = req.params.id;
  if (!/^\d{1,18}$/.test(id)) throw new HttpError(400, "id must be a number");
  const rows = await sql`
    SELECT id::text AS id, user_id::text AS user_id, title, content, created_at
    FROM posts WHERE id = ${id}`;
  if (rows.length === 0) throw new HttpError(404, "Post not found");
  return json(rows[0]);
}
