import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { TaskInput } from '../../../shared/types.js';
import { PRODUCT_TIME_ZONE, todayInTimeZone } from '../../../shared/validation.js';
import { BadRequestError, readJsonObject, readTaskId, readTaskInput, sendError, sendJson } from '../../../server/http.js';
import {
  TaskNotFoundError,
  TaskValidationError,
  deleteTask,
  updateTaskDetails,
} from '../../../server/tasksRepository.js';

const NOT_FOUND_MESSAGE = 'המשימה לא נמצאה. ייתכן שנמחקה. רענן את הדף כדי לראות את הרשימה העדכנית.';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PATCH, DELETE');
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת');
    return;
  }

  let id: string;
  let input: TaskInput | undefined;
  try {
    id = readTaskId(req);
    if (req.method === 'PATCH') input = readTaskInput(readJsonObject(req), true);
  } catch (error) {
    if (error instanceof BadRequestError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    throw error;
  }

  if (input) {
    await handleUpdate(res, id, input);
  } else {
    await handleDelete(res, id);
  }
}

async function handleUpdate(res: VercelResponse, id: string, input: TaskInput): Promise<void> {
  try {
    sendJson(res, 200, await updateTaskDetails(id, input, todayInTimeZone(PRODUCT_TIME_ZONE)));
  } catch (error) {
    if (error instanceof TaskValidationError) {
      const [first] = error.errors;
      sendError(res, 422, 'VALIDATION_ERROR', first.message, first.field);
    } else if (error instanceof TaskNotFoundError) {
      sendError(res, 404, 'TASK_NOT_FOUND', NOT_FOUND_MESSAGE);
    } else {
      // Log only the error message, never task contents.
      console.error('PATCH /api/tasks/:id failed:', error instanceof Error ? error.message : 'unknown error');
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לשמור את השינויים כרגע. נסה שוב.');
    }
  }
}

async function handleDelete(res: VercelResponse, id: string): Promise<void> {
  try {
    await deleteTask(id);
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      sendError(res, 404, 'TASK_NOT_FOUND', NOT_FOUND_MESSAGE);
    } else {
      console.error('DELETE /api/tasks/:id failed:', error instanceof Error ? error.message : 'unknown error');
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן למחוק את המשימה כרגע. נסה שוב.');
    }
  }
}
