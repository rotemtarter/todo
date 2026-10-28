import { useEffect, useState } from 'react';
import type { Task } from '../../shared/types';
import { getTasks } from '../api/tasksClient';
import TaskList, { type LoadStatus } from '../components/TaskList';
import TaskDetails from '../components/TaskDetails';

export default function HomePage() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;

  return (
    <>
      <div className="page__header">
        <h1 className="page__title">המשימות שלי</h1>
      </div>
      <div className="home-layout">
        <TaskList status={status} tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} />
        <TaskDetails task={selectedTask} />
      </div>
    </>
  );
}
