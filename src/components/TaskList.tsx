import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../shared/types';
import { getTaskLabel } from '../utils/taskLabel';
import { AlertIcon, DragHandleIcon } from './Icons';

export type LoadStatus = 'loading' | 'error' | 'ready';

export interface ListError {
  message: string;
  /** Shows the "refresh the list" button (order conflict, ADR-9). */
  canRefresh: boolean;
}

interface TaskListProps {
  status: LoadStatus;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRefresh: () => void;
  /** Tasks whose status is being saved; their checkbox waits for the answer. */
  pendingStatusIds: ReadonlySet<string>;
  /** While an order is being saved, another drag waits (ADR-9). */
  savingOrder: boolean;
  listError: ListError | null;
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'כדי להזיז משימה, לחץ על רווח או Enter, השתמש בחיצים למעלה ולמטה, ולחץ שוב על רווח או Enter כדי להניח אותה. Escape מבטל.',
};

export default function TaskList({
  status,
  tasks,
  selectedId,
  onSelect,
  onToggle,
  onReorder,
  onRefresh,
  pendingStatusIds,
  savingOrder,
  listError,
}: TaskListProps) {
  // Pointer covers mouse and touch; the small distance keeps a tap on the handle from starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (id: UniqueIdentifier) => {
    const task = tasks.find((item) => item.id === id);
    return task ? getTaskLabel(task) : '';
  };
  const placeOf = (id: UniqueIdentifier) => tasks.findIndex((item) => item.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `המשימה "${labelOf(active.id)}" הורמה. מקום ${placeOf(active.id)} מתוך ${tasks.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `המשימה "${labelOf(active.id)}" מעל מקום ${placeOf(over.id)} מתוך ${tasks.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `המשימה "${labelOf(active.id)}" הונחה במקום ${placeOf(over.id)} מתוך ${tasks.length}.`
        : `המשימה "${labelOf(active.id)}" הונחה.`,
    onDragCancel: ({ active }) => `הגרירה בוטלה. המשימה "${labelOf(active.id)}" חזרה למקומה.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  return (
    <section className="card task-list" aria-labelledby="task-list-title">
      <h2 id="task-list-title" className="card__title" tabIndex={-1}>
        רשימת משימות
      </h2>

      {listError && (
        <div className="list-alert" role="alert">
          <AlertIcon />
          <p className="list-alert__message">{listError.message}</p>
          {listError.canRefresh && (
            <button type="button" className="button button--secondary list-alert__refresh" onClick={onRefresh}>
              רענן את הרשימה
            </button>
          )}
        </div>
      )}

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            <ul className="task-list__items">
              {tasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedId}
                  statusPending={pendingStatusIds.has(task.id)}
                  dragDisabled={savingOrder}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

interface SortableTaskRowProps {
  task: Task;
  selected: boolean;
  statusPending: boolean;
  dragDisabled: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
}

function SortableTaskRow({ task, selected, statusPending, dragDisabled, onSelect, onToggle }: SortableTaskRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });
  const label = getTaskLabel(task);
  const className = [
    'task-row',
    selected && 'task-row--selected',
    task.completed && 'task-row--completed',
    isDragging && 'task-row--dragging',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={setNodeRef}
      className={className}
      data-task-id={task.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button type="button" className="task-row__select" aria-pressed={selected} onClick={() => onSelect(task.id)}>
        <span className="task-row__label">{label}</span>
      </button>
      <input
        type="checkbox"
        className="task-row__checkbox"
        checked={task.completed}
        disabled={statusPending}
        onChange={(event) => onToggle(task.id, event.target.checked)}
        aria-label={`סימון השלמה: ${label}`}
      />
      {/* Dragging starts only from this handle, so taps on the text or checkbox never move the row (ADR-9). */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="task-row__handle"
        {...attributes}
        {...listeners}
        aria-label={`גרור כדי לשנות את מיקום המשימה: ${label}`}
        disabled={dragDisabled}
      >
        <DragHandleIcon />
      </button>
    </li>
  );
}
