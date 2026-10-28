import type { Task } from '../../shared/types';

export class ApiRequestError extends Error {}

export async function getTasks(): Promise<Task[]> {
  let response: Response;
  try {
    response = await fetch('/api/tasks', { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!response.ok) {
    throw new ApiRequestError(`http ${response.status}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new ApiRequestError('invalid response');
  }
  return body as Task[];
}
