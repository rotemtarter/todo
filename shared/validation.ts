// Task input rules and Hebrew messages, shared by the browser and the API (ADR-6).
// Must stay browser-safe: no secrets and no database access.
import type { TaskInput } from './types.js';

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const TASK_LIMIT = 1000;
/** Time zone that defines "today" for server-side validation (ADR-5). */
export const PRODUCT_TIME_ZONE = 'Asia/Jerusalem';

export const MESSAGES = {
  titleOrDescriptionRequired: 'יש להזין כותרת או תיאור למשימה',
  titleTooLong: `הכותרת יכולה להכיל עד ${TITLE_MAX} תווים`,
  descriptionTooLong: 'התיאור יכול להכיל עד 2,000 תווים',
  dueDateInvalid: 'תאריך היעד אינו תקין',
  dueDateInPast: 'תאריך היעד לא יכול להיות בעבר',
  taskLimitReached: 'הרשימה מלאה (1,000 משימות). יש למחוק משימה לפני הוספת משימה חדשה.',
} as const;

export type TaskField = 'title' | 'description' | 'dueDate' | 'form';

export interface ValidationError {
  field: TaskField;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: TaskInput }
  | { ok: false; errors: ValidationError[] };

/** Trims text; an empty result becomes null. */
export function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Length in Unicode code points, matching PostgreSQL varchar limits. */
export function charLength(value: string): number {
  return [...value].length;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Validates task details. `today` is YYYY-MM-DD. When `savedDueDate` is given (editing),
 * the past-date rule applies only if the due date differs from the saved one (ADR-8).
 */
export function validateTaskInput(input: TaskInput, today: string, savedDueDate?: string | null): ValidationResult {
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  const dueDate = input.dueDate === null || input.dueDate === '' ? null : input.dueDate;
  const errors: ValidationError[] = [];

  if (title === null && description === null) {
    errors.push({ field: 'form', message: MESSAGES.titleOrDescriptionRequired });
  }
  if (title !== null && charLength(title) > TITLE_MAX) {
    errors.push({ field: 'title', message: MESSAGES.titleTooLong });
  }
  if (description !== null && charLength(description) > DESCRIPTION_MAX) {
    errors.push({ field: 'description', message: MESSAGES.descriptionTooLong });
  }
  if (dueDate !== null) {
    if (!isValidDateString(dueDate)) {
      errors.push({ field: 'dueDate', message: MESSAGES.dueDateInvalid });
    } else if (dueDate !== savedDueDate && dueDate < today) {
      // YYYY-MM-DD strings sort chronologically.
      errors.push({ field: 'dueDate', message: MESSAGES.dueDateInPast });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { title, description, dueDate } };
}
