import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TASK_LIMIT } from '../../shared/validation.js';
import {
  BadRequestError,
  ORDER_MAX_BODY_BYTES,
  readJsonObject,
  readOrderedIds,
  sendError,
  sendJson,
} from '../../server/http.js';
import { OrderConflictError, reorderTasks } from '../../server/tasksRepository.js';

const ORDER_CONFLICT_MESSAGE = 'רשימת המשימות השתנתה בינתיים. רענן את הרשימה ונסה שוב.';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת');
    return;
  }

  let orderedIds: string[];
  try {
    orderedIds = readOrderedIds(readJsonObject(req, ORDER_MAX_BODY_BYTES), TASK_LIMIT);
  } catch (error) {
    if (error instanceof BadRequestError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    throw error;
  }

  try {
    sendJson(res, 200, await reorderTasks(orderedIds));
  } catch (error) {
    if (error instanceof OrderConflictError) {
      sendError(res, 409, 'ORDER_CONFLICT', ORDER_CONFLICT_MESSAGE);
    } else {
      // Log only the error message, never task contents.
      console.error('PUT /api/tasks/order failed:', error instanceof Error ? error.message : 'unknown error');
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לשמור את סדר המשימות כרגע. נסה שוב.');
    }
  }
}
