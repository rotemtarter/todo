import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OfflineNotice from './OfflineNotice';

const MESSAGE = /אין חיבור לאינטרנט/;

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

describe('OfflineNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows nothing while online', () => {
    setOnline(true);
    render(<OfflineNotice />);
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the notice while offline', () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGE);
  });

  it('appears and disappears with the offline and online events', () => {
    setOnline(true);
    render(<OfflineNotice />);

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
});
