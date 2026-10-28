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
    expect(within(rows[1]).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
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
