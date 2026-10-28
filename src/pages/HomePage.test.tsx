import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
