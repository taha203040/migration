export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200): Response => Response.json(data, { status });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

export function str(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max: number },
): string {
  const v = body[field];
  if (typeof v !== "string") throw new HttpError(400, `${field} must be a string`);
  const t = v.trim();
  if (t.length < (opts.min ?? 1) || t.length > opts.max) {
    throw new HttpError(400, `${field} must be ${opts.min ?? 1}-${opts.max} characters`);
  }
  return t;
}
