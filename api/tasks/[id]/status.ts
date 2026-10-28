import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  BadRequestError,
  NOT_FOUND_MESSAGE,
  readCompleted,
  readJsonObject,
  readTaskId,
  sendError,
  sendJson,
} from '../../../server/http.js';
import { TaskNotFoundError, setTaskCompleted } from '../../../server/tasksRepository.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת');
    return;
  }

  let id: string;
  let completed: boolean;
  try {
    id = readTaskId(req);
    completed = readCompleted(readJsonObject(req));
  } catch (error) {
    if (error instanceof BadRequestError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    throw error;
  }

  try {
    sendJson(res, 200, await setTaskCompleted(id, completed));
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      sendError(res, 404, 'TASK_NOT_FOUND', NOT_FOUND_MESSAGE);
    } else {
      // Log only the error message, never task contents.
      console.error('PATCH /api/tasks/:id/status failed:', error instanceof Error ? error.message : 'unknown error');
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לעדכן את סטטוס המשימה כרגע. נסה שוב.');
    }
  }
}
