import type { Task } from '../../shared/types';
import { getTaskLabel } from '../utils/taskLabel';

export type LoadStatus = 'loading' | 'error' | 'ready';

interface TaskListProps {
  status: LoadStatus;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function TaskList({ status, tasks, selectedId, onSelect }: TaskListProps) {
  return (
    <section className="card task-list" aria-labelledby="task-list-title">
      <h2 id="task-list-title" className="card__title" tabIndex={-1}>
        רשימת משימות
      </h2>

      {status === 'loading' && (
        <p className="card__message" role="status">
          טוען משימות…
        </p>
      )}

      {status === 'error' && (
        <p className="card__message card__message--error" role="alert">
          לא ניתן לטעון את המשימות. בדוק את החיבור לאינטרנט ורענן את הדף.
        </p>
      )}

      {status === 'ready' && tasks.length === 0 && <p className="card__message">אין עדיין משימות ברשימה</p>}

      {status === 'ready' && tasks.length > 0 && (
        <ul className="task-list__items">
          {tasks.map((task) => {
            const selected = task.id === selectedId;
            const className = ['task-row', selected && 'task-row--selected', task.completed && 'task-row--completed']
              .filter(Boolean)
              .join(' ');
            return (
              <li key={task.id} className={className}>
                {/* Status indicator only; toggling is added in Milestone 4. */}
                <input
                  type="checkbox"
                  className="task-row__checkbox"
                  checked={task.completed}
                  disabled
                  readOnly
                  aria-label={task.completed ? 'הושלמה' : 'לביצוע'}
                />
                <button
                  type="button"
                  className="task-row__select"
                  aria-pressed={selected}
                  onClick={() => onSelect(task.id)}
                >
                  <span className="task-row__label">{getTaskLabel(task)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
