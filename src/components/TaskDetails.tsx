import { useId, useRef, useState, type FormEvent } from 'react';
import type { Task } from '../../shared/types';
import { validateTaskInput, type TaskField } from '../../shared/validation';
import { updateTask } from '../api/tasksClient';
import { localToday } from '../utils/date';
import { errorsByField, toFieldErrors, type FieldErrors } from '../utils/formErrors';
import DeleteTaskModal from './DeleteTaskModal';
import { AlertIcon, CheckCircleIcon, TrashIcon } from './Icons';

interface TaskDetailsProps {
  task: Task | null;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}

const SAVE_ERROR = 'לא ניתן לשמור את השינויים כרגע. נסה שוב.';

export default function TaskDetails({ task, onSaved, onDeleted }: TaskDetailsProps) {
  return (
    <section className="card task-details" aria-labelledby="task-details-title">
      <h2 id="task-details-title" className="card__title">
        פרטי משימה
      </h2>

      {!task ? (
        <p className="task-details__empty">בחר משימה מהרשימה כדי לצפות בפרטיה</p>
      ) : (
        <TaskEditor task={task} onSaved={onSaved} onDeleted={onDeleted} />
      )}
    </section>
  );
}

// The draft lives only here. The parent keys this component by task id, so selecting another task,
// leaving the page or refreshing discards unsaved changes without a prompt (PRD flow 3).
function TaskEditor({ task, onSaved, onDeleted }: { task: Task } & Omit<TaskDetailsProps, 'task'>) {
  const [title, setTitle] = useState(task.title ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  function edit(setter: (value: string) => void) {
    return (event: { target: { value: string } }) => {
      setter(event.target.value);
      setSaved(false);
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);

    // A saved due date that is already past stays valid as long as it is unchanged (ADR-8).
    const result = validateTaskInput({ title, description, dueDate: dueDate || null }, localToday(), task.dueDate);
    if (!result.ok) {
      setErrors(errorsByField(result.errors));
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const updated = await updateTask(task.id, result.value);
      setTitle(updated.title ?? '');
      setDescription(updated.description ?? '');
      setDueDate(updated.dueDate ?? '');
      setSaved(true);
      onSaved(updated);
    } catch (error) {
      setErrors(toFieldErrors(error, SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  }

  function closeDeleteModal() {
    setConfirmingDelete(false);
    deleteButtonRef.current?.focus();
  }

  const describedBy = (field: TaskField) => (errors[field] ? `${id}-${field}-error` : undefined);

  return (
    <>
      <form className="task-details__fields" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-title`}>
            כותרת
          </label>
          <input
            id={`${id}-title`}
            className="field__input"
            type="text"
            placeholder="הזן כותרת (לא חובה)"
            value={title}
            onChange={edit(setTitle)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy('title')}
          />
          {errors.title && (
            <span id={`${id}-title-error`} className="field__error">
              {errors.title}
            </span>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-description`}>
            תיאור
          </label>
          <textarea
            id={`${id}-description`}
            className="field__input field__input--multiline"
            placeholder="הזן תיאור (לא חובה)"
            rows={5}
            value={description}
            onChange={edit(setDescription)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy('description')}
          />
          {errors.description && (
            <span id={`${id}-description-error`} className="field__error">
              {errors.description}
            </span>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-dueDate`}>
            תאריך יעד
          </label>
          <input
            id={`${id}-dueDate`}
            className="field__input field__input--date"
            type="date"
            min={localToday()}
            value={dueDate}
            onChange={edit(setDueDate)}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby={describedBy('dueDate')}
          />
          {errors.dueDate && (
            <span id={`${id}-dueDate-error`} className="field__error">
              {errors.dueDate}
            </span>
          )}
        </div>

        {errors.form && (
          <p className="form-alert" role="alert">
            <AlertIcon />
            <span>{errors.form}</span>
          </p>
        )}
        {saved && (
          <p className="form-success" role="status">
            <CheckCircleIcon />
            <span>השינויים נשמרו</span>
          </p>
        )}

        <div className="task-details__actions">
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving ? 'שומר…' : 'שמור שינויים'}
          </button>
          <button
            ref={deleteButtonRef}
            type="button"
            className="button button--danger"
            disabled={saving}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon size={18} />
            מחק משימה
          </button>
        </div>
      </form>
      {confirmingDelete && (
        <DeleteTaskModal taskId={task.id} onDeleted={() => onDeleted(task.id)} onCancel={closeDeleteModal} />
      )}
    </>
  );
}
