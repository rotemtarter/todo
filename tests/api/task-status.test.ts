// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../shared/types.js';

class FakeTaskNotFoundError extends Error {}

let statusImpl: (id: string, completed: boolean) => Promise<Task>;
let statusCalls: unknown[][] = [];
vi.mock('../../server/tasksRepository.js', () => ({
  TaskNotFoundError: FakeTaskNotFoundError,
  setTaskCompleted: (...args: [string, boolean]) => {
    statusCalls.push(args);
    return statusImpl(...args);
  },
}));

const { default: handler } = await import('../../api/tasks/[id]/status.js');

const ID = '00000000-0000-4000-8000-000000000001';
const JSON_HEADERS = { 'content-type': 'application/json' };

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
    end() {
      return res;
    },
  };
  return res;
}

async function call(method: string, body: unknown, options: { id?: unknown; headers?: Record<string, string> } = {}) {
  const res = mockResponse();
  const req = { method, headers: options.headers ?? JSON_HEADERS, query: { id: options.id ?? ID } } as unknown as VercelRequest;
  Object.defineProperty(req, 'body', { get: () => body });
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const task = (completed: boolean): Task => ({ id: ID, title: 'א', description: null, dueDate: null, completed, position: 3 });

beforeEach(() => {
  statusCalls = [];
  statusImpl = async (_id, completed) => task(completed);
  vi.restoreAllMocks();
});

describe('PATCH /api/tasks/:id/status', () => {
  it('saves the explicit value both ways and returns 200 with the task', async () => {
    let res = await call('PATCH', { completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(task(true));
    res = await call('PATCH', { completed: false });
    expect(res.body).toEqual(task(false));
    expect(statusCalls).toEqual([
      [ID, true],
      [ID, false],
    ]);
  });

  it('ignores other fields such as title and position', async () => {
    await call('PATCH', { completed: true, title: 'x', position: 0 });
    expect(statusCalls).toEqual([[ID, true]]);
  });

  it.each([{}, { completed: 'true' }, { completed: 1 }, { completed: null }])('returns 400 for %j', async (body) => {
    const res = await call('PATCH', body);
    expect(res.statusCode).toBe(400);
    expect(statusCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid id and 415 for a non-JSON body', async () => {
    expect((await call('PATCH', { completed: true }, { id: 'abc' })).statusCode).toBe(400);
    expect((await call('PATCH', { completed: true }, { headers: { 'content-type': 'text/plain' } })).statusCode).toBe(415);
    expect(statusCalls).toHaveLength(0);
  });

  it('returns 404 when the task no longer exists', async () => {
    statusImpl = async () => {
      throw new FakeTaskNotFoundError();
    };
    const res = await call('PATCH', { completed: true });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('returns 503 without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    statusImpl = async () => {
      throw new Error('password=secret');
    };
    const res = await call('PATCH', { completed: true });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('rejects other methods with 405', async () => {
    const res = await call('POST', { completed: true });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PATCH');
  });
});
