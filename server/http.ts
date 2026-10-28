import type { VercelRequest, VercelResponse } from '@vercel/node';

export const MAX_BODY_BYTES = 16 * 1024;

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, status: number, code: string, message: string, field?: string): void {
  sendJson(res, status, { error: field ? { code, message, field } : { code, message } });
}

export class BadRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const INVALID_REQUEST = 'הבקשה אינה תקינה';

/** Returns the parsed JSON object body, or throws BadRequestError (wrong type, too large, malformed). */
export function readJsonObject(req: VercelRequest, maxBytes = MAX_BODY_BYTES): Record<string, unknown> {
  const contentType = String(req.headers['content-type'] ?? '');
  if (!/^application\/json(\s*;|$)/i.test(contentType)) {
    throw new BadRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', INVALID_REQUEST);
  }
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (declaredLength > maxBytes) {
    throw new BadRequestError(413, 'PAYLOAD_TOO_LARGE', INVALID_REQUEST);
  }
  let body: unknown;
  try {
    // Vercel parses JSON lazily and throws on malformed input.
    body = req.body;
  } catch {
    throw new BadRequestError(400, 'INVALID_JSON', INVALID_REQUEST);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
  }
  if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) {
    throw new BadRequestError(413, 'PAYLOAD_TOO_LARGE', INVALID_REQUEST);
  }
  return body as Record<string, unknown>;
}
