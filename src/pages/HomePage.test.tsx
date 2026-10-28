import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Task } from '../../shared/types';
import { localToday } from '../utils/date';
import HomePage from './HomePage';

function mockFetch(response: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(() => response));
}

afterEach(() => vi.unstubAllGlobals());

describe('HomePage', () => {
  it('shows the empty state only after a successful empty load', async () => {
    mockFetch(Promise.resolve(new Response('[]', { status: 200 })));
    render(<HomePage />);
    expect(await screen.findByText('אין עדיין משימות ברשימה')).toBeInTheDocument();
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
  });

  it('shows an error, not an empty list, when loading fails', async () => {
    mockFetch(Promise.resolve(new Response('{}', { status: 500 })));
    render(<HomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן לטעון את המשימות');
    expect(screen.queryByText('אין עדיין משימות ברשימה')).not.toBeInTheDocument();
  });

  it('shows the details of a selected task', async () => {
    const tasks = [
      { id: 'a', title: null, description: 'תיאור בלי כותרת', dueDate: '2026-11-01', completed: true, position: 0 },
    ];
    mockFetch(Promise.resolve(new Response(JSON.stringify(tasks), { status: 200 })));
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'תיאור בלי כותרת' }));
    expect(screen.getByLabelText('תיאור')).toHaveValue('תיאור בלי כותרת');
    expect(screen.getByLabelText('תאריך יעד')).toHaveValue('2026-11-01');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});

const existing: Task = { id: 'a', title: 'קיימת', description: null, dueDate: null, completed: false, position: 0 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// GET returns `tasks`; POST calls `onPost` with the parsed body.
function mockApi(tasks: Task[], onPost: (body: Record<string, unknown>) => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? onPost(JSON.parse(String(init.body))) : Promise.resolve(json(tasks)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const postCount = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length;

async function openModal() {
  fireEvent.click(await screen.findByRole('button', { name: 'הוסף משימה' }));
  return screen.getByRole('dialog', { name: 'הוספת משימה' });
}

describe('HomePage – create task', () => {
  it('opens the modal with empty text fields and today as the due date', async () => {
    mockApi([existing], async () => json({}, 500));
    render(<HomePage />);
    const dialog = await openModal();
    expect(within(dialog).getByLabelText('כותרת')).toHaveValue('');
    expect(within(dialog).getByLabelText('תיאור')).toHaveValue('');
    expect(within(dialog).getByLabelText('תאריך יעד')).toHaveValue(localToday());
    expect(within(dialog).getByLabelText('כותרת')).toHaveFocus();
    expect(within(dialog).getByPlaceholderText('הזן כותרת (לא חובה)')).toBeInTheDocument();
  });

  it('closing without saving discards the draft', async () => {
    mockApi([existing], async () => json({}, 500));
    render(<HomePage />);
    let dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'טיוטה' } });
    fireEvent.change(within(dialog).getByLabelText('תאריך יעד'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'סגור' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    dialog = await openModal();
    expect(within(dialog).getByLabelText('כותרת')).toHaveValue('');
    expect(within(dialog).getByLabelText('תאריך יעד')).toHaveValue(localToday());
    fireEvent.click(within(dialog).getByRole('button', { name: 'סגירת החלון' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows validation errors in the form without sending or clearing anything', async () => {
    const fetchMock = mockApi([existing], async () => json({}, 500));
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('תיאור'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('יש להזין כותרת או תיאור למשימה');

    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'א'.repeat(101) } });
    fireEvent.change(within(dialog).getByLabelText('תאריך יעד'), { target: { value: '2000-01-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    expect(within(dialog).getByText('הכותרת יכולה להכיל עד 100 תווים')).toBeInTheDocument();
    expect(within(dialog).getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('כותרת')).toHaveValue('א'.repeat(101));
    expect(postCount(fetchMock)).toBe(0);
  });

  it('a successful save closes the modal, appends the task and selects it', async () => {
    const created: Task = { id: 'new', title: 'חדשה', description: 'פרטים', dueDate: null, completed: false, position: 1 };
    let sent: Record<string, unknown> | undefined;
    mockApi([existing], async (body) => {
      sent = body;
      return json(created, 201);
    });
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: ' חדשה ' } });
    fireEvent.change(within(dialog).getByLabelText('תיאור'), { target: { value: 'פרטים' } });
    fireEvent.change(within(dialog).getByLabelText('תאריך יעד'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent).toEqual({ title: 'חדשה', description: 'פרטים', dueDate: null });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('חדשה');
    expect(within(rows[1]).getByRole('button', { name: 'חדשה' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('תיאור')).toHaveValue('פרטים');
  });

  it('disables the submit button while saving', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = mockApi([existing], () => new Promise((r) => (resolve = r)));
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'א' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    const saving = await within(dialog).findByRole('button', { name: 'שומר…' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(postCount(fetchMock)).toBe(1);
    resolve(json({ ...existing, id: 'b', title: 'א' }, 201));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a server error keeps the modal and values and allows a retry', async () => {
    let attempt = 0;
    mockApi([existing], async () => {
      attempt++;
      return attempt === 1
        ? json({ error: { code: 'TASK_LIMIT_REACHED', message: 'הרשימה מלאה (1,000 משימות).' } }, 409)
        : json({ ...existing, id: 'b', title: 'שוב' }, 201);
    });
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'שוב' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('הרשימה מלאה');
    expect(within(dialog).getByLabelText('כותרת')).toHaveValue('שוב');

    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a field error returned by the server next to that field', async () => {
    mockApi([existing], async () =>
      json({ error: { code: 'VALIDATION_ERROR', message: 'תאריך היעד לא יכול להיות בעבר', field: 'dueDate' } }, 422),
    );
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'א' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    const dateInput = within(dialog).getByLabelText('תאריך יעד');
    await waitFor(() => expect(dateInput).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
  });

  it('shows a network error in the form', async () => {
    mockApi([existing], () => Promise.reject(new TypeError('Failed to fetch')));
    render(<HomePage />);
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText('כותרת'), { target: { value: 'א' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('לא ניתן להתחבר לשרת');
  });

  it('disables adding and shows a notice when the list has 1,000 tasks', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ ...existing, id: `t${i}`, position: i }));
    mockApi(full, async () => json({}, 500));
    render(<HomePage />);
    await screen.findAllByRole('listitem');
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
    expect(screen.getByText(/הרשימה מלאה/)).toBeInTheDocument();
  });

  it('keeps adding disabled while loading and after a load error', async () => {
    mockFetch(Promise.resolve(new Response('{}', { status: 500 })));
    render(<HomePage />);
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
  });
});

const second: Task = { id: 'b', title: 'שנייה', description: 'תיאור', dueDate: '2000-01-01', completed: true, position: 1 };

// GET returns `tasks`; PATCH/DELETE call `onWrite` with the method, url and parsed body.
function mockWrites(
  tasks: Task[],
  onWrite: (method: string, url: string, body?: Record<string, unknown>) => Promise<Response>,
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    init?.method && init.method !== 'GET'
      ? onWrite(init.method, url, init.body ? JSON.parse(String(init.body)) : undefined)
      : Promise.resolve(json(tasks)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const writeCount = (fetchMock: ReturnType<typeof mockWrites>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method).length;

const details = () => within(document.querySelector('.task-details') as HTMLElement);

async function select(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
}

describe('HomePage – edit task details', () => {
  it('shows editable fields with save and delete buttons for the selected task', async () => {
    mockWrites([existing, second], async () => json({}, 500));
    render(<HomePage />);
    await select('שנייה');
    expect(details().getByLabelText('כותרת')).not.toHaveAttribute('readonly');
    expect(details().getByLabelText('כותרת')).toHaveValue('שנייה');
    expect(details().getByRole('button', { name: 'שמור שינויים' })).toBeEnabled();
    expect(details().getByRole('button', { name: 'מחק משימה' })).toBeEnabled();
  });

  it('saves all three fields, updates the list row and keeps completed/position', async () => {
    let sent: Record<string, unknown> | undefined;
    mockWrites([existing, second], async (method, url, body) => {
      sent = { method, url, ...body };
      // The server answer has a stale completed value; the client must not take it.
      return json({ ...second, ...body, completed: false, position: 9 });
    });
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('כותרת'), { target: { value: '  כותרת חדשה ' } });
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));

    expect(await details().findByRole('status')).toHaveTextContent('השינויים נשמרו');
    expect(sent).toEqual({ method: 'PATCH', url: '/api/tasks/b', title: 'כותרת חדשה', description: 'תיאור', dueDate: '2000-01-01' });
    expect(details().getByLabelText('כותרת')).toHaveValue('כותרת חדשה');
    const rows = screen.getAllByRole('listitem');
    expect(rows[1]).toHaveTextContent('כותרת חדשה');
    expect(within(rows[1]).getByRole('checkbox')).toBeChecked();
    expect(rows[0]).toHaveTextContent('קיימת');
  });

  it('allows an unchanged past due date but blocks changing it to another past date', async () => {
    const fetchMock = mockWrites([second], async (_m, _u, body) => json({ ...second, ...body }));
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('תאריך יעד'), { target: { value: '2000-01-02' } });
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));
    expect(details().getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
    expect(details().getByLabelText('תאריך יעד')).toHaveValue('2000-01-02');
    expect(writeCount(fetchMock, 'PATCH')).toBe(0);

    fireEvent.change(details().getByLabelText('תאריך יעד'), { target: { value: '2000-01-01' } });
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));
    expect(await details().findByRole('status')).toHaveTextContent('השינויים נשמרו');
    expect(writeCount(fetchMock, 'PATCH')).toBe(1);
  });

  it('blocks empty content without sending and keeps the typed values', async () => {
    const fetchMock = mockWrites([second], async () => json({}, 500));
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('כותרת'), { target: { value: ' ' } });
    fireEvent.change(details().getByLabelText('תיאור'), { target: { value: '' } });
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));
    expect(details().getByRole('alert')).toHaveTextContent('יש להזין כותרת או תיאור למשימה');
    expect(details().getByLabelText('כותרת')).toHaveValue(' ');
    expect(writeCount(fetchMock, 'PATCH')).toBe(0);
  });

  it('a server error keeps the draft and allows a retry', async () => {
    let attempt = 0;
    mockWrites([second], async (_m, _u, body) =>
      ++attempt === 1
        ? json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'לא ניתן לשמור את השינויים כרגע. נסה שוב.' } }, 503)
        : json({ ...second, ...body }),
    );
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('תיאור'), { target: { value: 'טיוטה' } });
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));
    expect(await details().findByRole('alert')).toHaveTextContent('לא ניתן לשמור את השינויים');
    expect(details().getByLabelText('תיאור')).toHaveValue('טיוטה');
    fireEvent.click(details().getByRole('button', { name: 'שמור שינויים' }));
    expect(await details().findByRole('status')).toHaveTextContent('השינויים נשמרו');
  });

  it('selecting another task discards the unsaved draft', async () => {
    mockWrites([existing, second], async () => json({}, 500));
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('כותרת'), { target: { value: 'לא נשמר' } });
    await select('קיימת');
    expect(details().getByLabelText('כותרת')).toHaveValue('קיימת');
    await select('שנייה');
    expect(details().getByLabelText('כותרת')).toHaveValue('שנייה');
  });
});

describe('HomePage – delete task', () => {
  it('cancel closes the confirmation without deleting', async () => {
    const fetchMock = mockWrites([existing, second], async () => new Response(null, { status: 204 }));
    render(<HomePage />);
    await select('שנייה');
    fireEvent.click(details().getByRole('button', { name: 'מחק משימה' }));
    const dialog = screen.getByRole('alertdialog', { name: 'מחיקת משימה' });
    expect(dialog).toHaveTextContent('האם אתה בטוח שברצונך למחוק את המשימה הזו?');
    expect(within(dialog).getByRole('button', { name: 'ביטול' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writeCount(fetchMock, 'DELETE')).toBe(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('confirm deletes the task and resets the details area', async () => {
    let url = '';
    mockWrites([existing, second], async (_m, u) => {
      url = u;
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    await select('שנייה');
    fireEvent.click(details().getByRole('button', { name: 'מחק משימה' }));
    fireEvent.click(screen.getByRole('button', { name: 'אישור' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(url).toBe('/api/tasks/b');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
  });

  it('a failed delete keeps the task and shows an error in the confirmation', async () => {
    mockWrites([existing, second], async () =>
      json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'לא ניתן למחוק את המשימה כרגע. נסה שוב.' } }, 503),
    );
    render(<HomePage />);
    await select('שנייה');
    fireEvent.click(details().getByRole('button', { name: 'מחק משימה' }));
    fireEvent.click(screen.getByRole('button', { name: 'אישור' }));
    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('לא ניתן למחוק');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(details().getByLabelText('כותרת')).toHaveValue('שנייה');
  });
});

describe('HomePage – task status', () => {
  const checkbox = (name: string) => screen.getByRole('checkbox', { name: `סימון השלמה: ${name}` });

  it('sends the explicit value, disables the checkbox until the answer, and keeps the row in place', async () => {
    let resolve: (response: Response) => void = () => {};
    let sent: Record<string, unknown> | undefined;
    mockWrites([existing, second], (method, url, body) => {
      sent = { method, url, ...body };
      return new Promise((r) => (resolve = r));
    });
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'סימון השלמה: קיימת' }));

    expect(sent).toEqual({ method: 'PATCH', url: '/api/tasks/a/status', completed: true });
    expect(checkbox('קיימת')).toBeChecked();
    expect(checkbox('קיימת')).toBeDisabled();
    resolve(json({ ...existing, completed: true }));
    await waitFor(() => expect(checkbox('קיימת')).toBeEnabled());
    expect(checkbox('קיימת')).toBeChecked();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('קיימת');
    expect(rows[0]).toHaveClass('task-row--completed');
  });

  it('can return a completed task to "to do"', async () => {
    let sent: Record<string, unknown> | undefined;
    mockWrites([second], async (_m, _u, body) => {
      sent = body;
      return json({ ...second, completed: false });
    });
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'סימון השלמה: שנייה' }));
    await waitFor(() => expect(checkbox('שנייה')).toBeEnabled());
    expect(sent).toEqual({ completed: false });
    expect(checkbox('שנייה')).not.toBeChecked();
  });

  it('a failure restores the previous value and shows a message in the list', async () => {
    mockWrites([existing], async () =>
      json({ error: { code: 'TASK_NOT_FOUND', message: 'המשימה לא נמצאה. ייתכן שנמחקה.' } }, 404),
    );
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'סימון השלמה: קיימת' }));
    const list = within(document.querySelector('.task-list') as HTMLElement);
    expect(await list.findByRole('alert')).toHaveTextContent('המשימה לא נמצאה');
    expect(checkbox('קיימת')).not.toBeChecked();
    expect(list.queryByRole('button', { name: 'רענן את הרשימה' })).not.toBeInTheDocument();
  });

  it('a network failure restores the value with a connection message', async () => {
    mockWrites([existing], async () => Promise.reject(new TypeError('offline')));
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'סימון השלמה: קיימת' }));
    expect(await screen.findByText(/בדוק את החיבור לאינטרנט/)).toBeInTheDocument();
    expect(checkbox('קיימת')).not.toBeChecked();
  });

  it('toggling the selected task keeps the unsaved draft and saves nothing else', async () => {
    const fetchMock = mockWrites([existing, second], async (_m, _u, body) => json({ ...second, ...body }));
    render(<HomePage />);
    await select('שנייה');
    fireEvent.change(details().getByLabelText('כותרת'), { target: { value: 'טיוטה' } });
    fireEvent.click(checkbox('שנייה'));
    await waitFor(() => expect(checkbox('שנייה')).toBeEnabled());
    expect(checkbox('שנייה')).not.toBeChecked();
    expect(details().getByLabelText('כותרת')).toHaveValue('טיוטה');
    const urls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([url]) => url);
    expect(urls).toEqual(['/api/tasks/b/status']);
  });

  it('each row has a drag handle separate from the text and checkbox', async () => {
    mockWrites([existing, second], async () => json({}, 500));
    render(<HomePage />);
    const handle = await screen.findByRole('button', { name: 'גרור כדי לשנות את מיקום המשימה: קיימת' });
    expect(handle).toHaveClass('task-row__handle');
    expect(screen.getByRole('button', { name: 'קיימת' })).not.toBe(handle);
  });
});
