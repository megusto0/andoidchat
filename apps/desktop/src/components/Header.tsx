import s from "./Header.module.css";

interface Props {
  showVisualization: boolean;
  onToggleVisualization: () => void;
  onDisconnect: () => void;
  className?: string;
}

export function Header({
  showVisualization,
  onToggleVisualization,
  onDisconnect,
  className,
}: Props) {
  return (
    <div className={`${s.actions} ${className ?? ""}`}>
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
  );
}
