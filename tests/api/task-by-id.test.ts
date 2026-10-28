// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task, TaskInput } from '../../shared/types.js';
import { MESSAGES, type ValidationError } from '../../shared/validation.js';

class FakeTaskNotFoundError extends Error {}
class FakeTaskValidationError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('invalid');
  }
}

let updateImpl: (id: string, input: TaskInput, today: string) => Promise<Task>;
let updateCalls: { id: string; input: TaskInput; today: string }[] = [];
let deleteImpl: (id: string) => Promise<void>;
let deleteCalls: string[] = [];
vi.mock('../../server/tasksRepository.js', () => ({
  TaskNotFoundError: FakeTaskNotFoundError,
  TaskValidationError: FakeTaskValidationError,
  updateTaskDetails: (id: string, input: TaskInput, today: string) => {
    updateCalls.push({ id, input, today });
    return updateImpl(id, input, today);
  },
  deleteTask: (id: string) => {
    deleteCalls.push(id);
    return deleteImpl(id);
  },
}));

const { default: handler } = await import('../../api/tasks/[id]/index.js');

const ID = '00000000-0000-4000-8000-000000000001';

function mockResponse() {
  const res = {
    statusCode: 0,
    ended: false,
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
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

async function call(
  method: string,
  options: { id?: unknown; body?: unknown; headers?: Record<string, string> } = {},
) {
  const res = mockResponse();
  const req = { method, headers: options.headers ?? {}, query: { id: options.id ?? ID } } as unknown as VercelRequest;
  Object.defineProperty(req, 'body', { get: () => options.body });
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const patch = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  call('PATCH', { body, headers });

const full = { title: 'כותרת', description: null, dueDate: null };

beforeEach(() => {
  updateCalls = [];
  deleteCalls = [];
  updateImpl = async (id, input) => ({ id, ...input, completed: true, position: 2 });
  deleteImpl = async () => {};
  vi.restoreAllMocks();
});

describe('PATCH /api/tasks/:id', () => {
  it('updates the details and returns 200 with the task', async () => {
    const res = await patch({ title: 'חדש', description: 'תיאור', dueDate: '2030-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ id: ID, title: 'חדש', completed: true, position: 2 });
    expect(updateCalls).toEqual([
      { id: ID, input: { title: 'חדש', description: 'תיאור', dueDate: '2030-01-01' }, today: expect.any(String) },
    ]);
  });

  it('passes only the three detail fields, ignoring completed and position', async () => {
    await patch({ ...full, completed: false, position: 0, id: 'other' });
    expect(updateCalls[0].input).toEqual(full);
    expect(updateCalls[0].id).toBe(ID);
  });

  it.each([
    ['a missing title key', { description: null, dueDate: null }],
    ['a missing dueDate key', { title: 'א', description: null }],
    ['a number title', { ...full, title: 5 }],
    ['a non-object body', ['x']],
  ])('returns 400 for %s', async (_name, body) => {
    const res = await patch(body);
    expect(res.statusCode).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 415 for a non-JSON content type', async () => {
    const res = await patch('title=x', { 'content-type': 'text/plain' });
    expect(res.statusCode).toBe(415);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 422 with the field when validation fails', async () => {
    updateImpl = async () => {
      throw new FakeTaskValidationError([{ field: 'dueDate', message: MESSAGES.dueDateInPast }]);
    };
    const res = await patch({ ...full, dueDate: '2000-01-01' });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: MESSAGES.dueDateInPast, field: 'dueDate' } });
  });

  it('returns 404 when the task no longer exists', async () => {
    updateImpl = async () => {
      throw new FakeTaskNotFoundError();
    };
    const res = await patch(full);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('returns 503 without leaking details or task contents', async () => {
    updateImpl = async () => {
      throw new Error('connection to app_backend failed');
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await patch({ ...full, title: 'סוד פרטי' });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('app_backend');
    expect(JSON.stringify(log.mock.calls)).not.toContain('סוד פרטי');
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes and returns 204 with no body', async () => {
    const res = await call('DELETE');
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeUndefined();
    expect(deleteCalls).toEqual([ID]);
  });

  it('returns 404 when the task does not exist', async () => {
    deleteImpl = async () => {
      throw new FakeTaskNotFoundError();
    };
    const res = await call('DELETE');
    expect(res.statusCode).toBe(404);
  });

  it('returns 503 when the database fails', async () => {
    deleteImpl = async () => {
      throw new Error('timeout');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('DELETE');
    expect(res.statusCode).toBe(503);
  });
});

describe('/api/tasks/:id routing', () => {
  it.each(['not-a-uuid', '1; drop table tasks', ['a', 'b']])('returns 400 for an invalid id %#', async (id) => {
    const res = await call('DELETE', { id });
    expect(res.statusCode).toBe(400);
    expect(deleteCalls).toHaveLength(0);
  });

  it('rejects other methods with 405', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('PATCH, DELETE');
    expect(updateCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });
});
