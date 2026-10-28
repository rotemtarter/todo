import { useOnlineStatus } from '../hooks/useOnlineStatus';

// Shown on both pages while offline (ADR-10). Nothing is cached, so actions simply fail and roll back.
export default function OfflineNotice() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-notice" role="status">
      אין חיבור לאינטרנט. לא ניתן לצפות במשימות עדכניות או לשמור שינויים עד שהחיבור יחזור.
    </div>
  );
}
