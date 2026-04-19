import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import s from "./WindowTitlebar.module.css";

interface Props {
  meta?: string;
}

async function readMaximizedState() {
  return invoke<boolean>("window_is_maximized");
}

function MinimizeIcon() {
  return (
    <svg
      className={s.controlIcon}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M1.5 7.5H8.5" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      className={s.controlIcon}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <rect x="1.5" y="1.5" width="7" height="7" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      className={s.controlIcon}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d="M3.5 1.5H8.5V6.5" />
      <path d="M3.5 1.5V3.5H1.5V8.5H6.5V6.5" />
      <rect x="3.5" y="3.5" width="5" height="5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className={s.controlIcon}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M2 2L8 8" />
      <path d="M8 2L2 8" />
    </svg>
  );
}

export function WindowTitlebar({ meta }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [controlsEnabled, setControlsEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let active = true;

    const syncMaximized = async () => {
      try {
        const maximized = await readMaximizedState();
        if (!active) return;
        setIsMaximized(maximized);
        setControlsEnabled(true);
      } catch (_) {
        if (active) setControlsEnabled(false);
      }
    };

    void syncMaximized();

    const handleResize = () => {
      void syncMaximized();
    };
    const handleFocus = () => {
      if (active) setIsFocused(true);
    };
    const handleBlur = () => {
      if (active) setIsFocused(false);
    };

    setIsFocused(document.hasFocus());
    window.addEventListener("resize", handleResize);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      active = false;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  async function handleMinimize() {
    try {
      await invoke("window_minimize");
      setControlsEnabled(true);
    } catch (_) {
      /* */
    }
  }

  async function handleToggleMaximize() {
    try {
      const maximized = await invoke<boolean>("window_toggle_maximize");
      setIsMaximized(maximized);
      setControlsEnabled(true);
    } catch (_) {
      /* */
    }
  }

  async function handleClose() {
    try {
      await invoke("window_close");
    } catch (_) {
      /* */
    }
  }

  const maximizeTitle = isMaximized ? "Восстановить" : "Развернуть";

  return (
    <header
      className={`${s.titlebar} ${!isFocused ? s.titlebarInactive : ""}`}
    >
      <div
        className={s.dragRegion}
        data-tauri-drag-region
        onDoubleClick={() => void handleToggleMaximize()}
      >
        <div className={s.brand} data-tauri-drag-region>
          <div className={s.brandIcon} data-tauri-drag-region>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className={s.brandText} data-tauri-drag-region>
            TCP Messenger
          </span>
        </div>
        {meta && (
          <span className={s.meta} data-tauri-drag-region>
            {meta}
          </span>
        )}
      </div>

      <div className={s.controls}>
        <button
          type="button"
          className={s.controlBtn}
          onClick={() => void handleMinimize()}
          aria-label="Свернуть"
          title="Свернуть"
          disabled={!controlsEnabled}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className={s.controlBtn}
          onClick={() => void handleToggleMaximize()}
          aria-label={maximizeTitle}
          title={maximizeTitle}
          disabled={!controlsEnabled}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className={`${s.controlBtn} ${s.closeBtn}`}
          onClick={() => void handleClose()}
          aria-label="Закрыть"
          title="Закрыть"
          disabled={!controlsEnabled}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
