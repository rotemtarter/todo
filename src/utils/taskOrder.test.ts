import { describe, expect, it } from 'vitest';
import type { Task } from '../../shared/types';
import { applyServerPositions, moveTask, restoreOrder } from './taskOrder';

const task = (id: string, position: number, completed = false): Task => ({
  id,
  title: id,
  description: null,
  dueDate: null,
  completed,
  position,
});
const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const list = [task('a', 0), task('b', 1), task('c', 2), task('d', 3)];

describe('moveTask', () => {
  it('moves a task down and up', () => {
    expect(ids(moveTask(list, 'a', 'c'))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(moveTask(list, 'd', 'b'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same array when nothing moves or an id is unknown', () => {
    expect(moveTask(list, 'b', 'b')).toBe(list);
    expect(moveTask(list, 'x', 'b')).toBe(list);
  });
});

describe('restoreOrder', () => {
  it('restores the previous order but keeps values changed meanwhile', () => {
    const moved = moveTask(list, 'a', 'd').map((t) => (t.id === 'b' ? { ...t, completed: true } : t));
    const restored = restoreOrder(moved, ['a', 'b', 'c', 'd']);
    expect(ids(restored)).toEqual(['a', 'b', 'c', 'd']);
    expect(restored[1].completed).toBe(true);
  });

  it('keeps tasks unknown to the previous order at the end', () => {
    expect(ids(restoreOrder([task('new', 9), ...list], ['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c', 'd', 'new']);
  });
});

describe('applyServerPositions', () => {
  it('takes order and position from the server without overwriting other fields', () => {
    const current = [task('b', 1, true), task('a', 0), task('c', 2)];
    const server = [task('b', 0, false), task('a', 1), task('c', 2)];
    const result = applyServerPositions(current, server);
    expect(ids(result)).toEqual(['b', 'a', 'c']);
    expect(result.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(result[0].completed).toBe(true);
  });

  it('keeps tasks created meanwhile and drops tasks deleted meanwhile', () => {
    const current = [task('a', 0), task('new', 5)];
    const server = [task('a', 0), task('gone', 1)];
    expect(ids(applyServerPositions(current, server))).toEqual(['a', 'new']);
  });
});
