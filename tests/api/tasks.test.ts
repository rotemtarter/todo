// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task, TaskInput } from '../../shared/types.js';
import { MESSAGES, PRODUCT_TIME_ZONE, todayInTimeZone } from '../../shared/validation.js';

class FakeTaskLimitError extends Error {}

let listTasksImpl: () => Promise<Task[]>;
let listTasksCalls = 0;
let createTaskImpl: (input: TaskInput) => Promise<Task>;
let createTaskCalls: TaskInput[] = [];
vi.mock('../../server/tasksRepository.js', () => ({
  TaskLimitError: FakeTaskLimitError,
  listTasks: () => {
    listTasksCalls++;
    return listTasksImpl();
  },
  createTask: (input: TaskInput) => {
    createTaskCalls.push(input);
    return createTaskImpl(input);
  },
}));

const { default: handler } = await import('../../api/tasks/index.js');

function mockResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

async function call(method: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
  const res = mockResponse();
  const req = { method, headers: options.headers ?? {} } as VercelRequest;
  Object.defineProperty(req, 'body', { get: () => options.body });
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  call('POST', { body, headers });

const sample: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'לקנות מצרכים',
  description: null,
  dueDate: '2026-10-30',
  completed: false,
  position: 0,
};

const today = todayInTimeZone(PRODUCT_TIME_ZONE);

beforeEach(() => {
  listTasksCalls = 0;
  listTasksImpl = async () => [];
  createTaskCalls = [];
  createTaskImpl = async (input) => ({ ...sample, ...input, position: 3 });
  vi.restoreAllMocks();
});

describe('GET /api/tasks', () => {
  it('returns the tasks with no-store caching', async () => {
    listTasksImpl = async () => [sample];
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([sample]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns an empty array when there are no tasks', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 503 without leaking details when the database fails', async () => {
    listTasksImpl = async () => {
      throw new Error('password authentication failed for user app_backend');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('GET');
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('app_backend');
  });

  it('rejects other methods with 405', async () => {
    const res = await call('DELETE');
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('GET, POST');
    expect(listTasksCalls).toBe(0);
    expect(createTaskCalls).toHaveLength(0);
  });
});

describe('POST /api/tasks', () => {
  it('creates a task and returns 201 with the normalized values', async () => {
    const res = await post({ title: '  משימה  ', description: '', dueDate: today });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(createTaskCalls).toEqual([{ title: 'משימה', description: null, dueDate: today }]);
    expect(res.body).toMatchObject({ title: 'משימה', completed: false });
  });

  it('accepts a description only, with missing fields treated as null', async () => {
    const res = await post({ description: 'רק תיאור' });
    expect(res.statusCode).toBe(201);
    expect(createTaskCalls).toEqual([{ title: null, description: 'רק תיאור', dueDate: null }]);
  });

  it('ignores completed and position sent by the client', async () => {
    await post({ title: 'א', completed: true, position: 0 });
    expect(createTaskCalls).toEqual([{ title: 'א', description: null, dueDate: null }]);
  });

  it.each([
    [{ title: '   ', description: '\n' }, 'form', MESSAGES.titleOrDescriptionRequired],
    [{ title: 'א'.repeat(101) }, 'title', MESSAGES.titleTooLong],
    [{ description: 'א'.repeat(2001) }, 'description', MESSAGES.descriptionTooLong],
    [{ title: 'א', dueDate: '2000-01-01' }, 'dueDate', MESSAGES.dueDateInPast],
    [{ title: 'א', dueDate: '2030-13-01' }, 'dueDate', MESSAGES.dueDateInvalid],
  ])('returns 422 for invalid input %#', async (body, field, message) => {
    const res = await post(body);
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message, field } });
    expect(createTaskCalls).toHaveLength(0);
  });

  it.each([
    ['a non-object body', [1, 2]],
    ['a number title', { title: 5 }],
    ['a boolean due date', { title: 'א', dueDate: true }],
  ])('returns 400 for %s', async (_name, body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = mockResponse();
    const req = { method: 'POST', headers: { 'content-type': 'application/json' } } as VercelRequest;
    Object.defineProperty(req, 'body', {
      get: () => {
        throw new Error('Invalid JSON');
      },
    });
    await handler(req, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(400);
  });

  it('returns 415 for a non-JSON content type', async () => {
    const res = await post('title=x', { 'content-type': 'application/x-www-form-urlencoded' });
    expect(res.statusCode).toBe(415);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 413 for a body over 16KB', async () => {
    const res = await post({ title: 'א', description: 'x'.repeat(17 * 1024) });
    expect(res.statusCode).toBe(413);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 409 TASK_LIMIT_REACHED when the list is full', async () => {
    createTaskImpl = async () => {
      throw new FakeTaskLimitError();
    };
    const res = await post({ title: 'א' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: { code: 'TASK_LIMIT_REACHED', message: MESSAGES.taskLimitReached } });
  });

  it('returns 503 without leaking details when the database fails', async () => {
    createTaskImpl = async () => {
      throw new Error('connection to app_backend failed');
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ title: 'סוד פרטי' });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('app_backend');
    // Task contents are never logged.
    expect(JSON.stringify(log.mock.calls)).not.toContain('סוד פרטי');
  });
});
