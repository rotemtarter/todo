// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../shared/types.js';

let listTasksImpl: () => Promise<Task[]>;
let listTasksCalls = 0;
vi.mock('../../server/tasksRepository.js', () => ({
  listTasks: () => {
    listTasksCalls++;
    return listTasksImpl();
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

async function call(method: string) {
  const res = mockResponse();
  await handler({ method } as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sample: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'לקנות מצרכים',
  description: null,
  dueDate: '2026-10-30',
  completed: false,
  position: 0,
};

describe('GET /api/tasks', () => {
  beforeEach(() => {
    listTasksCalls = 0;
    listTasksImpl = async () => [];
  });

  it('returns the tasks with no-store caching', async () => {
    listTasksImpl = async () => [sample];
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([sample]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns an empty array when there are no tasks', async () => {
    listTasksImpl = async () => [];
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
    const res = await call('POST');
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('GET');
    expect(listTasksCalls).toBe(0);
  });
});
