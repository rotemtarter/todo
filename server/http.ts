import type { VercelResponse } from '@vercel/node';

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, status: number, code: string, message: string, field?: string): void {
  sendJson(res, status, { error: field ? { code, message, field } : { code, message } });
}
