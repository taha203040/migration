import { DUMMY_HASH, hashPassword, signToken, verifyPassword } from "../auth";
import { sql } from "../db";
import { HttpError, json, readJson, str } from "../http";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signup(req: Request): Promise<Response> {
  const body = await readJson(req);
  const name = str(body, "name", { max: 100 });
  const email = str(body, "email", { max: 254 }).toLowerCase();
  const password = str(body, "password", { min: 8, max: 200 });
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "email is not valid");

  const passwordHash = await hashPassword(password);
  const rows = await sql`
    INSERT INTO users (name, email, password_hash)
    VALUES (${name}, ${email}, ${passwordHash})
    ON CONFLICT (email) DO NOTHING
    RETURNING id::text AS id, name, email, created_at`;
  if (rows.length === 0) throw new HttpError(409, "Email already registered");
  return json(rows[0], 201);
}

export async function login(req: Request): Promise<Response> {
  const body = await readJson(req);
  const email = str(body, "email", { max: 254 }).toLowerCase();
  const password = str(body, "password", { max: 200 });

  const rows = await sql`SELECT id::text AS id, password_hash FROM users WHERE email = ${email}`;
  const user = rows[0];
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Invalid email or password");
  return json({ token: await signToken(user.id), user_id: user.id });
}
