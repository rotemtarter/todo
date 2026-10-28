import type { Task } from '../../shared/types';

// Row text: the title, or the first non-empty line of the description when there is no title.
// Visual truncation of long text is done in CSS.
export function getTaskLabel(task: Pick<Task, 'title' | 'description'>): string {
  const title = task.title?.trim();
  if (title) return title;
  const firstLine = (task.description ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? '';
}
