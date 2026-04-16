import { useState } from "react";
import { useSimulation } from "../hooks/useSimulation";
import { MetricsGrid } from "./MetricsGrid";
import { ConnectionGraph } from "./ConnectionGraph";
import s from "./VisualizationPanel.module.css";

interface Props {
  onClose: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  connecting: "Подключение",
  messaging: "Отправка сообщений",
  disconnecting: "Отключение",
  done: "Завершено",
};

const PHASE_COLORS: Record<string, string> = {
  connecting: s.phaseConnecting,
  messaging: s.phaseMessaging,
  disconnecting: s.phaseDisconnecting,
  done: s.phaseDone,
};

export function VisualizationPanel({ onClose }: Props) {
  const { metrics, running, start, stop, isDone, passed } = useSimulation();
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("5000");
  const [count, setCount] = useState("55");

  function handleStart() {
    start(host, Number(port), Number(count));
  }

  const phase = metrics.phase || "idle";

  return (
    <aside className={s.panel}>
      <div className={s.panelHeader}>
        <div className={s.panelTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>Симуляция</span>
        </div>
        <button className={s.closeBtn} onClick={onClose} aria-label="Закрыть">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={s.content}>
        {/* Управление */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Управление</div>

          <div className={s.fieldRow}>
            <div className={s.fieldWrap}>
              <label className={s.fieldLabel}>Хост</label>
              <input
                className={s.inputSm}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
                disabled={running}
              />
            </div>
            <div className={s.fieldWrap} style={{ maxWidth: 75 }}>
              <label className={s.fieldLabel}>Порт</label>
              <input
                className={s.inputSm}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="5000"
                disabled={running}
              />
            </div>
            <div className={s.fieldWrap} style={{ maxWidth: 60 }}>
              <label className={s.fieldLabel}>Боты</label>
              <input
                className={s.inputSm}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="55"
                disabled={running}
              />
            </div>
          </div>

          <div className={s.btnRow}>
            <button
              className={s.btnStart}
              onClick={handleStart}
              disabled={running}
            >
              {running ? (
                <>
                  <span className={s.spinner} />
                  Запущено
                </>
              ) : (
                "Запустить"
              )}
            </button>
            {running && (
              <button className={s.btnStop} onClick={stop}>
                Стоп
              </button>
            )}
          </div>

          <div className={s.phaseBadge}>
            <span className={`${s.phaseDot} ${PHASE_COLORS[phase] || s.phaseDone}`} />
            {PHASE_LABELS[phase] || phase}
          </div>
        </div>

        {/* Метрики */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Метрики</div>
          <MetricsGrid metrics={metrics} />
        </div>

        {/* Граф */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Подключения</div>
          <ConnectionGraph bots={metrics.botStatuses} />
        </div>

        {metrics.elapsedSeconds > 0 && (
          <div className={s.elapsed}>
            Время: {metrics.elapsedSeconds.toFixed(1)} сек
          </div>
        )}

        {isDone && (
          <div className={`${s.result} ${passed ? s.resultPass : s.resultFail}`}>
            {passed
              ? `ПРОЙДЕН — ${metrics.totalConnected} подключений, 0 ошибок`
              : `НЕ ПРОЙДЕН — подключений: ${metrics.totalConnected}, некорректных: ${metrics.incorrectResponses}`}
          </div>
        )}
      </div>
    </aside>
  );
}
