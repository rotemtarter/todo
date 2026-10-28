import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Task } from '../../shared/types';
import { validateTaskInput, type TaskField } from '../../shared/validation';
import { createTask } from '../api/tasksClient';
import { localToday } from '../utils/date';
import { errorsByField, toFieldErrors, type FieldErrors } from '../utils/formErrors';
import { AlertIcon, CloseIcon } from './Icons';

interface CreateTaskModalProps {
  onCreated: (task: Task) => void;
  onClose: () => void;
}

const SAVE_ERROR = 'לא ניתן לשמור את המשימה כרגע. נסה שוב.';

// The draft lives only in this component; the parent unmounts it on close, so every opening starts fresh.
export default function CreateTaskModal({ onCreated, onClose }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(localToday);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const result = validateTaskInput({ title, description, dueDate: dueDate || null }, localToday());
    if (!result.ok) {
      setErrors(errorsByField(result.errors));
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      onCreated(await createTask(result.value));
    } catch (error) {
      setSaving(false);
      setErrors(toFieldErrors(error, SAVE_ERROR));
    }
  }

  const describedBy = (field: TaskField) => (errors[field] ? `${id}-${field}-error` : undefined);

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-heading`}>
        <div className="modal__header">
          <h2 id={`${id}-heading`} className="modal__title">
            הוספת משימה
          </h2>
          <button type="button" className="modal__close" aria-label="סגירת החלון" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form className="modal__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-title`}>
              כותרת
            </label>
            <input
              ref={titleRef}
              id={`${id}-title`}
              className="field__input"
              type="text"
              placeholder="הזן כותרת (לא חובה)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
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
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
              onChange={(event) => setDueDate(event.target.value)}
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

          <div className="modal__actions">
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? 'שומר…' : 'הוסף משימה'}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              סגור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
