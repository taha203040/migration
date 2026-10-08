import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { HttpError } from "./http";

const key = new TextEncoder().encode(config.jwtSecret);

export const hashPassword = (pw: string) =>
  Bun.password.hash(pw, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });

export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash);

// Used to keep login time similar whether or not the email exists.
export const DUMMY_HASH = await hashPassword("dummy-password-for-timing");

export const signToken = (userId: string) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Missing bearer token");
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (!payload.sub) throw new Error();
    return payload.sub;
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}
