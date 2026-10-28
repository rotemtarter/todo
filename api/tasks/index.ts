import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError, sendJson } from '../../server/http.js';
import { listTasks } from '../../server/tasksRepository.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת');
    return;
  }

  try {
    sendJson(res, 200, await listTasks());
  } catch (error) {
    // Log only the error type/message, never task contents.
    console.error('GET /api/tasks failed:', error instanceof Error ? error.message : 'unknown error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לטעון את המשימות כרגע. נסה שוב מאוחר יותר.');
  }
}
