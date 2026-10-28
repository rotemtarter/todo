import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { TaskInput } from '../../shared/types.js';
import { MESSAGES, PRODUCT_TIME_ZONE, todayInTimeZone, validateTaskInput } from '../../shared/validation.js';
import { BadRequestError, readJsonObject, readTaskInput, sendError, sendJson } from '../../server/http.js';
import { TaskLimitError, createTask, listTasks } from '../../server/tasksRepository.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    await handleList(res);
  } else if (req.method === 'POST') {
    await handleCreate(req, res);
  } else {
    res.setHeader('Allow', 'GET, POST');
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת');
  }
}

async function handleList(res: VercelResponse): Promise<void> {
  try {
    sendJson(res, 200, await listTasks());
  } catch (error) {
    // Log only the error type/message, never task contents.
    console.error('GET /api/tasks failed:', error instanceof Error ? error.message : 'unknown error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לטעון את המשימות כרגע. נסה שוב מאוחר יותר.');
  }
}

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  let input: TaskInput;
  try {
    input = readTaskInput(readJsonObject(req));
  } catch (error) {
    if (error instanceof BadRequestError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    throw error;
  }

  const result = validateTaskInput(input, todayInTimeZone(PRODUCT_TIME_ZONE));
  if (!result.ok) {
    const [first] = result.errors;
    sendError(res, 422, 'VALIDATION_ERROR', first.message, first.field);
    return;
  }

  try {
    sendJson(res, 201, await createTask(result.value));
  } catch (error) {
    if (error instanceof TaskLimitError) {
      sendError(res, 409, 'TASK_LIMIT_REACHED', MESSAGES.taskLimitReached);
      return;
    }
    console.error('POST /api/tasks failed:', error instanceof Error ? error.message : 'unknown error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'לא ניתן לשמור את המשימה כרגע. נסה שוב.');
  }
}
