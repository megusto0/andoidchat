import type { ConnectionStatus } from "../types";
import s from "./Header.module.css";

interface Props {
  userName: string;
  host: string;
  port: string;
  status: ConnectionStatus;
  showVisualization: boolean;
  onToggleVisualization: () => void;
  onDisconnect: () => void;
  onToggleSidebar: () => void;
}

export function Header({
  userName,
  host,
  port,
  status,
  showVisualization,
  onToggleVisualization,
  onDisconnect,
  onToggleSidebar,
}: Props) {
  const brandMeta =
    status === "connected" && host && port
      ? `${host}:${port} · TCP`
      : userName || "offline";

  return (
    <header className={s.header}>
      <button
        className={s.menuBtn}
        onClick={onToggleSidebar}
        aria-label="Меню"
        title="Боковая панель"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </svg>
      </button>

      <div className={s.brand}>
        <div className={s.brandIcon}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <span className={s.brandText}>TCP Messenger</span>
        <span className={s.brandMeta}>{brandMeta}</span>
      </div>

      <div className={s.spacer} />
      <div className={s.actions}>
        <button
          className={`${s.actionBtn} ${showVisualization ? s.actionBtnActive : ""}`}
          onClick={onToggleVisualization}
          title="Симуляция"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>Симуляция</span>
        </button>

        <button className={s.disconnectBtn} onClick={onDisconnect} title="Отключиться">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Выйти</span>
        </button>
      </div>
    </header>
  );
}
