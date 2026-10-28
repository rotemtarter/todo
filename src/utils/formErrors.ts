import type { TaskField } from '../../shared/validation';
import { ApiRequestError } from '../api/tasksClient';

export type FieldErrors = Partial<Record<TaskField, string>>;

export const NETWORK_ERROR = 'לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.';

/** Validation errors keyed by field; the first message per field wins. */
export function errorsByField(errors: { field: TaskField; message: string }[]): FieldErrors {
  const result: FieldErrors = {};
  for (const error of errors) result[error.field] ??= error.message;
  return result;
}

/** Maps a failed request to a message next to the field (422 with a field) or a general form message. */
export function toFieldErrors(error: unknown, fallback: string): FieldErrors {
  if (!(error instanceof ApiRequestError) || error.status === undefined) {
    return { form: NETWORK_ERROR };
  }
  const message = error.userMessage ?? fallback;
  const field = error.field as TaskField | undefined;
  if (error.status === 422 && field && field !== 'form') {
    return { [field]: message };
  }
  return { form: message };
}
