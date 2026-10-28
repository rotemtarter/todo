// Task as exchanged between the API and the browser.
export interface Task {
  id: string;
  title: string | null;
  description: string | null;
  /** Date only, formatted YYYY-MM-DD. */
  dueDate: string | null;
  completed: boolean;
  position: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

// Body of POST /api/tasks and PATCH /api/tasks/:id.
export interface TaskInput {
  title: string | null;
  description: string | null;
  /** Date only, formatted YYYY-MM-DD, or null. */
  dueDate: string | null;
}
