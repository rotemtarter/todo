import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../../shared/types';
import { TASK_LIMIT } from '../../shared/validation';
import { ApiRequestError, getTasks, reorderTasks, setTaskCompleted } from '../api/tasksClient';
import TaskList, { type ListError, type LoadStatus } from '../components/TaskList';
import TaskDetails from '../components/TaskDetails';
import CreateTaskModal from '../components/CreateTaskModal';
import { NETWORK_ERROR } from '../utils/formErrors';
import { applyServerPositions, moveTask, restoreOrder } from '../utils/taskOrder';

const STATUS_ERROR = 'לא ניתן לעדכן את סטטוס המשימה. נסה שוב.';
const ORDER_ERROR = 'לא ניתן לשמור את הסדר החדש. הסדר הקודם הוחזר.';

/** The server's Hebrew message when it sent one, otherwise a network or general message. */
function messageOf(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError) || error.status === undefined) return NETWORK_ERROR;
  return error.userMessage ?? fallback;
}

export default function HomePage() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(new Set());
  const [savingOrder, setSavingOrder] = useState(false);
  const [listError, setListError] = useState<ListError | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Current list for async handlers, which must not act on a stale render.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    let cancelled = false;
    getTasks()
      .then((loaded) => {
        if (cancelled) return;
        setTasks(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reloads the list on request only (no polling). The selection stays if the task still exists.
  const refreshList = useCallback(async () => {
    setListError(null);
    setStatus('loading');
    try {
      const loaded = await getTasks();
      setTasks(loaded);
      setSelectedId((current) => (current && loaded.some((task) => task.id === current) ? current : null));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // Saved immediately and shown optimistically; on failure only this task's `completed` is restored (ADR-9).
  // The selection and the details draft are left alone (PRD FR-05).
  const handleToggle = useCallback(async (id: string, completed: boolean) => {
    setListError(null);
    setPendingStatusIds((current) => new Set(current).add(id));
    const setCompleted = (value: boolean) =>
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, completed: value } : task)));
    setCompleted(completed);
    try {
      const saved = await setTaskCompleted(id, completed);
      setCompleted(saved.completed);
    } catch (error) {
      setCompleted(!completed);
      setListError({ message: messageOf(error, STATUS_ERROR), canRefresh: false });
    } finally {
      setPendingStatusIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  // Moves the row at once and sends every known id. On failure the previous order returns; on 409 the
  // list is not overwritten and a refresh is offered (ADR-9).
  const handleReorder = useCallback(async (activeId: string, overId: string) => {
    const previous = tasksRef.current;
    const moved = moveTask(previous, activeId, overId);
    if (moved === previous) return;
    const previousIds = previous.map((task) => task.id);
    setListError(null);
    setTasks(moved);
    setSavingOrder(true);
    try {
      const saved = await reorderTasks(moved.map((task) => task.id));
      setTasks((current) => applyServerPositions(current, saved));
    } catch (error) {
      setTasks((current) => restoreOrder(current, previousIds));
      const conflict = error instanceof ApiRequestError && error.status === 409;
      setListError({ message: messageOf(error, ORDER_ERROR), canRefresh: conflict });
    } finally {
      setSavingOrder(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setCreating(false);
    addButtonRef.current?.focus();
  }, []);

  const handleCreated = useCallback(
    (task: Task) => {
      setTasks((current) => [...current, task]);
      setSelectedId(task.id);
      closeModal();
    },
    [closeModal],
  );

  // Take only the detail fields from the response, so completed/position are never overwritten (ADR-9).
  const handleSaved = useCallback((updated: Task) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === updated.id
          ? { ...task, title: updated.title, description: updated.description, dueDate: updated.dueDate }
          : task,
      ),
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    setSelectedId(null);
    document.getElementById('task-list-title')?.focus();
  }, []);

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const listFull = status === 'ready' && tasks.length >= TASK_LIMIT;
  // Without a loaded list the client can't enforce the limit, so adding waits for it.
  const canAdd = status === 'ready' && !listFull;

  return (
    <>
      <div className="page__header">
        <h1 className="page__title">המשימות שלי</h1>
        <div className="page__actions">
          {listFull && (
            <p className="page__notice" id="list-full-notice">
              הרשימה מלאה (1,000 משימות). יש למחוק משימה כדי להוסיף חדשה.
            </p>
          )}
          <button
            ref={addButtonRef}
            type="button"
            className="button button--primary page__add"
            disabled={!canAdd}
            aria-describedby={listFull ? 'list-full-notice' : undefined}
            onClick={() => setCreating(true)}
          >
            הוסף משימה
          </button>
        </div>
      </div>
      <div className="home-layout">
        <TaskList
          status={status}
          tasks={tasks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onToggle={handleToggle}
          onReorder={handleReorder}
          onRefresh={refreshList}
          pendingStatusIds={pendingStatusIds}
          savingOrder={savingOrder}
          listError={listError}
        />
        {/* Keyed by task: switching tasks discards the unsaved draft. */}
        <TaskDetails key={selectedId ?? 'none'} task={selectedTask} onSaved={handleSaved} onDeleted={handleDeleted} />
      </div>
      {creating && <CreateTaskModal onCreated={handleCreated} onClose={closeModal} />}
    </>
  );
}
