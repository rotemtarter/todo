import type { Task } from '../../shared/types';

interface TaskDetailsProps {
  task: Task | null;
}

// Read-only in Milestone 1; editing and deletion are added in Milestone 3.
export default function TaskDetails({ task }: TaskDetailsProps) {
  return (
    <section className="card task-details" aria-labelledby="task-details-title">
      <h2 id="task-details-title" className="card__title">
        פרטי משימה
      </h2>

      {!task ? (
        <p className="task-details__empty">בחר משימה מהרשימה כדי לצפות בפרטיה</p>
      ) : (
        <div className="task-details__fields">
          <label className="field">
            <span className="field__label">כותרת</span>
            <input className="field__input" type="text" value={task.title ?? ''} readOnly />
          </label>
          <label className="field">
            <span className="field__label">תיאור</span>
            <textarea className="field__input field__input--multiline" value={task.description ?? ''} readOnly rows={5} />
          </label>
          <label className="field">
            <span className="field__label">תאריך יעד</span>
            <input className="field__input field__input--date" type="date" value={task.dueDate ?? ''} readOnly />
          </label>
        </div>
      )}
    </section>
  );
}
