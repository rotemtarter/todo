// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../shared/types.js';

class FakeOrderConflictError extends Error {}

let reorderImpl: (ids: string[]) => Promise<Task[]>;
let reorderCalls: string[][] = [];
vi.mock('../../server/tasksRepository.js', () => ({
  OrderConflictError: FakeOrderConflictError,
  reorderTasks: (ids: string[]) => {
    reorderCalls.push(ids);
    return reorderImpl(ids);
  },
}));

const { default: handler } = await import('../../api/tasks/order.js');

const JSON_HEADERS = { 'content-type': 'application/json' };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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

async function call(method: string, body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  const res = mockResponse();
  const req = { method, headers, query: {} } as unknown as VercelRequest;
  Object.defineProperty(req, 'body', { get: () => body });
  await handler(req, res as unknown as VercelResponse);
  return res;
}

beforeEach(() => {
  reorderCalls = [];
  reorderImpl = async (ids) =>
    ids.map((id, position) => ({ id, title: 'א', description: null, dueDate: null, completed: false, position }));
  vi.restoreAllMocks();
});

describe('PUT /api/tasks/order', () => {
  it('returns 200 with the list in the new order', async () => {
    const res = await call('PUT', { orderedIds: [uuid(2), uuid(1)] });
    expect(res.statusCode).toBe(200);
    expect((res.body as Task[]).map((t) => [t.id, t.position])).toEqual([
      [uuid(2), 0],
      [uuid(1), 1],
    ]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('accepts an empty array (empty list) and 1,000 ids in one body', async () => {
    expect((await call('PUT', { orderedIds: [] })).statusCode).toBe(200);
    const thousand = Array.from({ length: 1000 }, (_, i) => uuid(i));
    expect((await call('PUT', { orderedIds: thousand })).statusCode).toBe(200);
    expect(reorderCalls[1]).toHaveLength(1000);
  });

  it.each([
    ['not an array', { orderedIds: uuid(1) }],
    ['missing', {}],
    ['not a UUID', { orderedIds: [uuid(1), 'abc'] }],
    ['duplicates', { orderedIds: [uuid(1), uuid(1)] }],
    ['over 1,000 ids', { orderedIds: Array.from({ length: 1001 }, (_, i) => uuid(i)) }],
  ])('returns 400 when ids are %s', async (_name, body) => {
    const res = await call('PUT', body);
    expect([400, 413]).toContain(res.statusCode);
    expect(reorderCalls).toHaveLength(0);
  });

  it('returns 413 for a body over 64KB and 415 for a non-JSON body', async () => {
    expect((await call('PUT', { orderedIds: [], pad: 'x'.repeat(70 * 1024) })).statusCode).toBe(413);
    expect((await call('PUT', { orderedIds: [] }, { 'content-type': 'text/plain' })).statusCode).toBe(415);
  });

  it('returns 409 ORDER_CONFLICT when the ids do not match the stored list', async () => {
    reorderImpl = async () => {
      throw new FakeOrderConflictError();
    };
    const res = await call('PUT', { orderedIds: [uuid(1)] });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'ORDER_CONFLICT', message: expect.stringContaining('רענן') } });
  });

  it('returns 503 without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reorderImpl = async () => {
      throw new Error('password=secret');
    };
    const res = await call('PUT', { orderedIds: [uuid(1)] });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('rejects other methods with 405', async () => {
    const res = await call('PATCH', { orderedIds: [] });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PUT');
  });
});
