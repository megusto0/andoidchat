import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import s from "./WindowTitlebar.module.css";

interface Props {
  meta?: string;
}

function hasTauriWindowControls() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getAppWindow() {
  return hasTauriWindowControls() ? getCurrentWindow() : null;
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
  const controlsEnabled = hasTauriWindowControls();

  useEffect(() => {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    let active = true;
    let unlistenResize: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    const syncMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        if (active) setIsMaximized(maximized);
      } catch (_) {
        /* window state is unavailable */
      }
    };

    const syncFocused = async () => {
      try {
        const focused = await appWindow.isFocused();
        if (active) setIsFocused(focused);
      } catch (_) {
        /* window state is unavailable */
      }
    };

    void syncMaximized();
    void syncFocused();

    void appWindow.onResized(() => {
      void syncMaximized();
    }).then((unlisten) => {
      if (active) unlistenResize = unlisten;
      else unlisten();
    });

    void appWindow.onFocusChanged(({ payload }) => {
      if (active) setIsFocused(payload);
    }).then((unlisten) => {
      if (active) unlistenFocus = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      unlistenResize?.();
      unlistenFocus?.();
    };
  }, []);

  async function handleMinimize() {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      await appWindow.minimize();
    } catch (_) {
      /* */
    }
  }

  async function handleToggleMaximize() {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      await appWindow.toggleMaximize();
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch (_) {
      /* */
    }
  }

  async function handleClose() {
    const appWindow = getAppWindow();
    if (!appWindow) return;

    try {
      await appWindow.close();
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
