import { describe, expect, it } from 'vitest';
import { getTaskLabel } from './taskLabel';

describe('getTaskLabel', () => {
  it('uses the title when present', () => {
    expect(getTaskLabel({ title: 'לקנות מצרכים', description: 'חלב ולחם' })).toBe('לקנות מצרכים');
  });

  it('falls back to the first non-empty description line when there is no title', () => {
    expect(getTaskLabel({ title: null, description: '\n  לבדוק אפשרויות ביטוח לרכב  \nשורה שנייה' })).toBe(
      'לבדוק אפשרויות ביטוח לרכב',
    );
  });

  it('treats a whitespace-only title as missing', () => {
    expect(getTaskLabel({ title: '   ', description: 'תיאור' })).toBe('תיאור');
  });
});
