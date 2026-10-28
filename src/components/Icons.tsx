import type { ReactNode } from 'react';

// Simple line icons from the style guide (DESIGN 2.3). Decorative only: buttons carry their own text or label.

interface IconProps {
  size?: number;
}

function LineIcon({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </LineIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </LineIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </LineIcon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </LineIcon>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </LineIcon>
  );
}

export function DragHandleIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="5.5" cy="3" r="1.3" />
      <circle cx="10.5" cy="3" r="1.3" />
      <circle cx="5.5" cy="8" r="1.3" />
      <circle cx="10.5" cy="8" r="1.3" />
      <circle cx="5.5" cy="13" r="1.3" />
      <circle cx="10.5" cy="13" r="1.3" />
    </svg>
  );
}
