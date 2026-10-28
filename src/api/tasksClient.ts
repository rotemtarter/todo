import type { Task, TaskInput } from '../../shared/types';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly field?: string,
    /** Hebrew message from the server, when it sent one. */
    readonly userMessage?: string,
  ) {
    super(message);
  }
}

export async function getTasks(): Promise<Task[]> {
  let response: Response;
  try {
    response = await fetch('/api/tasks', { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!response.ok) {
    throw new ApiRequestError(`http ${response.status}`, response.status);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new ApiRequestError('invalid response');
  }
  return body as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  let response: Response;
  try {
    response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiRequestError('network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status !== 201) {
    throw errorFromBody(response.status, body);
  }
  if (!body || typeof body !== 'object' || typeof (body as Task).id !== 'string') {
    throw new ApiRequestError('invalid response', response.status);
  }
  return body as Task;
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  let response: Response;
  try {
    response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiRequestError('network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status !== 200) {
    throw errorFromBody(response.status, body);
  }
  if (!body || typeof body !== 'object' || (body as Task).id !== id) {
    throw new ApiRequestError('invalid response', response.status);
  }
  return body as Task;
}

export async function deleteTask(id: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiRequestError('network');
  }
  if (response.status !== 204) {
    throw errorFromBody(response.status, await response.json().catch(() => null));
  }
}

function errorFromBody(status: number, body: unknown): ApiRequestError {
  const error = (body as { error?: { code?: unknown; message?: unknown; field?: unknown } } | null)?.error;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return new ApiRequestError(`http ${status}`, status, text(error?.code), text(error?.field), text(error?.message));
}
