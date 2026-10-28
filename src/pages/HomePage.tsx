import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../../shared/types';
import { TASK_LIMIT } from '../../shared/validation';
import { getTasks } from '../api/tasksClient';
import TaskList, { type LoadStatus } from '../components/TaskList';
import TaskDetails from '../components/TaskDetails';
import CreateTaskModal from '../components/CreateTaskModal';

export default function HomePage() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

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
        <TaskList status={status} tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} />
        <TaskDetails task={selectedTask} />
      </div>
      {creating && <CreateTaskModal onCreated={handleCreated} onClose={closeModal} />}
    </>
  );
}
