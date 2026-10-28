import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { TaskInput } from '../shared/types.js';

export const MAX_BODY_BYTES = 16 * 1024;
// 1,000 UUIDs are about 39KB (ADR-9).
export const ORDER_MAX_BODY_BYTES = 64 * 1024;

export const NOT_FOUND_MESSAGE = 'המשימה לא נמצאה. ייתכן שנמחקה. רענן את הדף כדי לראות את הרשימה העדכנית.';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** The task id from the dynamic route segment, or throws BadRequestError when it isn't a UUID. */
export function readTaskId(req: VercelRequest): string {
  const id = req.query?.id;
  if (!isUuid(id)) {
    throw new BadRequestError(400, 'INVALID_ID', INVALID_REQUEST);
  }
  return id;
}

/**
 * Reads {title, description, dueDate}; each must be a string or null. Other fields are ignored.
 * With `requireAll` (PATCH, ADR-8) a missing key is rejected; otherwise it counts as null.
 */
export function readTaskInput(body: Record<string, unknown>, requireAll = false): TaskInput {
  const pick = (key: string): string | null => {
    if (requireAll && !(key in body)) throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
    return value;
  };
  return { title: pick('title'), description: pick('description'), dueDate: pick('dueDate') };
}

/** Reads {completed: boolean} (PATCH /api/tasks/:id/status). Other fields are ignored. */
export function readCompleted(body: Record<string, unknown>): boolean {
  if (typeof body.completed !== 'boolean') throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
  return body.completed;
}

/** Reads {orderedIds}: up to maxIds distinct UUIDs (PUT /api/tasks/order). */
export function readOrderedIds(body: Record<string, unknown>, maxIds: number): string[] {
  const ids = body.orderedIds;
  if (!Array.isArray(ids) || ids.length > maxIds || !ids.every(isUuid)) {
    throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
  }
  const normalized = ids.map((id) => id.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new BadRequestError(400, 'INVALID_REQUEST', INVALID_REQUEST);
  }
  return normalized;
}
