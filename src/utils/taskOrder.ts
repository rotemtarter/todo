import { arrayMove } from '@dnd-kit/sortable';
import type { Task } from '../../shared/types';

/** The list with `activeId` moved to the place of `overId`; the same array when nothing moves. */
export function moveTask(tasks: Task[], activeId: string, overId: string): Task[] {
  const from = tasks.findIndex((task) => task.id === activeId);
  const to = tasks.findIndex((task) => task.id === overId);
  if (from === -1 || to === -1 || from === to) return tasks;
  return arrayMove(tasks, from, to);
}

/**
 * Puts the tasks back in `previousIds` order, keeping their current values, so a status
 * change made meanwhile is not undone (ADR-9). Tasks missing from `previousIds` stay at the end.
 */
export function restoreOrder(current: Task[], previousIds: string[]): Task[] {
  const rank = new Map(previousIds.map((id, index) => [id, index]));
  const last = previousIds.length;
  return [...current].sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
}

/**
 * Takes only order and position from the server's list; every other field stays as in `current`.
 * Tasks the answer doesn't know (created meanwhile) stay at the end; tasks deleted meanwhile are dropped.
 */
export function applyServerPositions(current: Task[], serverTasks: Task[]): Task[] {
  const byId = new Map(current.map((task) => [task.id, task]));
  const ordered = serverTasks.flatMap((saved) => {
    const task = byId.get(saved.id);
    return task ? [{ ...task, position: saved.position }] : [];
  });
  const known = new Set(serverTasks.map((task) => task.id));
  return [...ordered, ...current.filter((task) => !known.has(task.id))];
}
