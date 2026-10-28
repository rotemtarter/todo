import { useEffect, useId, useRef, useState } from 'react';
import { deleteTask } from '../api/tasksClient';
import { toFieldErrors } from '../utils/formErrors';

interface DeleteTaskModalProps {
  taskId: string;
  onDeleted: () => void;
  onCancel: () => void;
}

const DELETE_ERROR = 'לא ניתן למחוק את המשימה כרגע. נסה שוב.';

// Confirmation before deleting (DESIGN 1.4). The task is removed from the view only after the server succeeds.
export default function DeleteTaskModal({ taskId, onDeleted, onCancel }: DeleteTaskModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Focus the safe choice first, so an accidental Enter doesn't delete.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, deleting]);

  async function handleConfirm() {
    if (deleting) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteTask(taskId);
      onDeleted();
    } catch (failure) {
      setDeleting(false);
      setError(toFieldErrors(failure, DELETE_ERROR).form ?? DELETE_ERROR);
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal modal--small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        aria-describedby={`${id}-question`}
      >
        <div className="modal__header">
          <h2 id={`${id}-heading`} className="modal__title">
            מחיקת משימה
          </h2>
        </div>
        <div className="modal__body">
          <p id={`${id}-question`}>האם אתה בטוח שברצונך למחוק את המשימה הזו?</p>
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <div className="modal__actions">
            <button type="button" className="button button--danger-solid" disabled={deleting} onClick={handleConfirm}>
              {deleting ? 'מוחק…' : 'אישור'}
            </button>
            <button ref={cancelRef} type="button" className="button button--secondary" disabled={deleting} onClick={onCancel}>
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
