import { describe, expect, it } from 'vitest';
import { MESSAGES, charLength, isValidDateString, todayInTimeZone, validateTaskInput } from './validation';

const TODAY = '2026-10-28';
const input = (title: string | null, description: string | null, dueDate: string | null = null) => ({
  title,
  description,
  dueDate,
});

function errorsOf(result: ReturnType<typeof validateTaskInput>) {
  return result.ok ? [] : result.errors;
}

describe('validateTaskInput', () => {
  it('accepts a title only, a description only, or both, and trims them', () => {
    expect(validateTaskInput(input('  כותרת  ', null), TODAY)).toEqual({
      ok: true,
      value: { title: 'כותרת', description: null, dueDate: null },
    });
    expect(validateTaskInput(input('', ' תיאור\n'), TODAY)).toEqual({
      ok: true,
      value: { title: null, description: 'תיאור', dueDate: null },
    });
    expect(validateTaskInput(input('א', 'ב', TODAY), TODAY).ok).toBe(true);
  });

  it('rejects empty and whitespace-only title and description with the PRD message', () => {
    for (const [title, description] of [
      [null, null],
      ['', ''],
      ['   ', '\n\t '],
    ]) {
      expect(errorsOf(validateTaskInput(input(title, description), TODAY))).toEqual([
        { field: 'form', message: MESSAGES.titleOrDescriptionRequired },
      ]);
    }
  });

  it('enforces 100/2000 character limits in code points', () => {
    expect(validateTaskInput(input('א'.repeat(100), null), TODAY).ok).toBe(true);
    expect(errorsOf(validateTaskInput(input('א'.repeat(101), null), TODAY))).toEqual([
      { field: 'title', message: MESSAGES.titleTooLong },
    ]);
    expect(validateTaskInput(input(null, 'x'.repeat(2000)), TODAY).ok).toBe(true);
    expect(errorsOf(validateTaskInput(input(null, 'x'.repeat(2001)), TODAY))).toEqual([
      { field: 'description', message: MESSAGES.descriptionTooLong },
    ]);
    // An emoji is two UTF-16 units but one character.
    expect(validateTaskInput(input('😀'.repeat(100), null), TODAY).ok).toBe(true);
  });

  it('allows today, a future date or no date, and rejects the past', () => {
    expect(validateTaskInput(input('א', null, TODAY), TODAY).ok).toBe(true);
    expect(validateTaskInput(input('א', null, '2026-10-29'), TODAY).ok).toBe(true);
    expect(validateTaskInput(input('א', null, ''), TODAY)).toMatchObject({ ok: true, value: { dueDate: null } });
    expect(errorsOf(validateTaskInput(input('א', null, '2026-10-27'), TODAY))).toEqual([
      { field: 'dueDate', message: MESSAGES.dueDateInPast },
    ]);
  });

  it('rejects malformed or impossible dates', () => {
    for (const date of ['2026-02-30', '28/10/2026', '2026-1-5', 'tomorrow']) {
      expect(errorsOf(validateTaskInput(input('א', null, date), TODAY))).toEqual([
        { field: 'dueDate', message: MESSAGES.dueDateInvalid },
      ]);
    }
  });

  it('keeps an unchanged saved past date valid when editing', () => {
    expect(validateTaskInput(input('א', null, '2026-01-01'), TODAY, '2026-01-01').ok).toBe(true);
    expect(validateTaskInput(input('א', null, '2026-01-02'), TODAY, '2026-01-01').ok).toBe(false);
  });

  it('reports several errors at once', () => {
    const fields = errorsOf(validateTaskInput(input('א'.repeat(101), null, '2020-01-01'), TODAY)).map((e) => e.field);
    expect(fields).toEqual(['title', 'dueDate']);
  });
});

describe('helpers', () => {
  it('charLength counts code points', () => {
    expect(charLength('שלום')).toBe(4);
    expect(charLength('👍🏽')).toBe(2);
  });

  it('isValidDateString accepts real dates only', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
  });

  it('todayInTimeZone uses the given time zone', () => {
    // 22:30 UTC on Oct 28 is already Oct 29 in Jerusalem.
    const now = new Date('2026-10-28T22:30:00Z');
    expect(todayInTimeZone('Asia/Jerusalem', now)).toBe('2026-10-29');
    expect(todayInTimeZone('UTC', now)).toBe('2026-10-28');
  });
});
