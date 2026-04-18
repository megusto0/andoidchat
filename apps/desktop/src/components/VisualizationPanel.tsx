import { useEffect, useMemo, useState } from "react";
import { useSimulation } from "../hooks/useSimulation";
import type {
  SimBotStatus as BotStatus,
  SimulationFeedMessage,
  SimulationMode,
} from "../types";
import s from "./VisualizationPanel.module.css";

interface Props {
  onClose: () => void;
  sendCommand: (raw: string) => Promise<void> | void;
}

const TRAFFIC_HISTORY_SIZE = 40;
const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 42;
const SPARK_PADDING = 4;

const PHASE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  connecting: "Подключение",
  messaging: "Работа",
  disconnecting: "Отключение",
  done: "Завершено",
  cancelled: "Остановлено",
};

const MODE_LABELS: Record<SimulationMode, string> = {
  visible: "Visible",
  benchmark: "Benchmark",
};

function formatSession(seconds: number) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}м ${sec}с`;
}

function formatStamp(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildSparkline(values: number[]) {
  const safeValues = values.length
    ? values
    : Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0);
  const maxValue = Math.max(1, ...safeValues);
  const usableWidth = SPARK_WIDTH - SPARK_PADDING * 2;
  const usableHeight = SPARK_HEIGHT - SPARK_PADDING * 2;
  const step = safeValues.length > 1 ? usableWidth / (safeValues.length - 1) : 0;

  const points = safeValues.map((value, index) => {
    const x = SPARK_PADDING + step * index;
    const ratio = value / maxValue;
    const y = SPARK_HEIGHT - SPARK_PADDING - ratio * usableHeight;
    return { x, y };
  });

  const line = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`
    )
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(2)},${(SPARK_HEIGHT - SPARK_PADDING).toFixed(
    2
  )} L${first.x.toFixed(2)},${(SPARK_HEIGHT - SPARK_PADDING).toFixed(2)} Z`;

  return { line, area, last };
}

function statusColor(status: BotStatus["status"]) {
  if (status === "active") return "#7ec489";
  if (status === "connecting") return "var(--accent)";
  if (status === "error") return "var(--error)";
  return "var(--text-tertiary)";
}

function TopologyView({
  bots,
  elapsedSeconds,
}: {
  bots: BotStatus[];
  elapsedSeconds: number;
}) {
  const visible = bots.slice(0, 18);
  const centerX = 50;
  const centerY = 50;

  const nodes = visible.map((bot, index) => {
    const angle = (index / Math.max(visible.length, 1)) * Math.PI * 2;
    const radius = index % 2 === 0 ? 38 : 30;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    return { bot, x, y };
  });

  const packets = nodes
    .filter((node) => node.bot.status === "active")
    .map((node, index) => {
      const progress = ((elapsedSeconds * 0.75 + index * 0.16) % 1 + 1) % 1;
      return {
        id: node.bot.name,
        x: centerX + (node.x - centerX) * progress,
        y: centerY + (node.y - centerY) * progress,
      };
    });

  return (
    <svg
      className={s.topologySvg}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="simServerGlow" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={centerX} cy={centerY} r="18" fill="url(#simServerGlow)" />

      {nodes.map((node) => (
        <line
          key={`line-${node.bot.name}`}
          x1={centerX}
          y1={centerY}
          x2={node.x}
          y2={node.y}
          className={s.topologyLine}
        />
      ))}

      {packets.map((packet) => (
        <circle
          key={`packet-${packet.id}`}
          cx={packet.x}
          cy={packet.y}
          r="0.9"
          className={s.topologyPacket}
        />
      ))}

      <circle cx={centerX} cy={centerY} r="6.4" className={s.topologyServer} />
      <text x={centerX} y={centerY + 1} className={s.topologyServerText}>
        SERVER
      </text>
      <text x={centerX} y={centerY + 4.4} className={s.topologyServerSub}>
        :5000
      </text>

      {nodes.map((node) => (
        <g key={node.bot.name}>
          <circle
            cx={node.x}
            cy={node.y}
            r="1.8"
            fill={statusColor(node.bot.status)}
          />
          {node.bot.status === "connecting" && (
            <circle
              cx={node.x}
              cy={node.y}
              r={2.7 + ((elapsedSeconds * 2.5) % 1.8)}
              className={s.topologyPulseRing}
            />
          )}
          <text
            x={node.x}
            y={node.y + (node.y > centerY ? 4 : -2.8)}
            className={s.topologyLabel}
          >
            {node.bot.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function FeedRow({ item }: { item: SimulationFeedMessage }) {
  const tagClass =
    item.sender === "Server" ? `${s.logTag} ${s.logTagServer}` : `${s.logTag} ${s.logTagBot}`;
  const tagLabel = item.sender === "Server" ? "SERVER" : "BOT";

  return (
    <div className={s.logItem} key={item.id}>
      <span className={s.logTime}>{formatStamp(item.timestampMs)}</span>
      <span className={tagClass}>{tagLabel}</span>
      <span className={s.logBot}>{item.sender}</span>
      <span className={s.logText}>{item.text}</span>
    </div>
  );
}

export function VisualizationPanel({ onClose, sendCommand }: Props) {
  const { metrics, result, feed, running, mode, setMode, start, stop, isDone, passed } =
    useSimulation(sendCommand);
  const [count, setCount] = useState("55");
  const [trafficHistory, setTrafficHistory] = useState<number[]>(
    Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0)
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleStart() {
    void start(Math.max(1, Number(count) || 55));
  }

  const displayMetrics = result ?? metrics;
  const phase = displayMetrics.phase || "idle";
  const effectiveMode = running ? metrics.mode : result?.mode ?? mode;
  const requestedBots = Math.max(
    0,
    displayMetrics.requestedClients || Number(count) || 0
  );
  const connectedAll =
    requestedBots === 0 || displayMetrics.totalConnected >= requestedBots;
  const hasVerificationErrors = displayMetrics.incorrectResponses > 0;
  const hasConnectionErrors = displayMetrics.failedConnections > 0;
  const passedResult =
    isDone &&
    passed &&
    connectedAll &&
    !hasConnectionErrors &&
    !hasVerificationErrors;

  const resultText = passedResult
    ? `ПРОЙДЕН — ${MODE_LABELS[displayMetrics.mode]} · подключено ${displayMetrics.totalConnected}/${requestedBots || displayMetrics.totalConnected}, ошибок проверки нет`
    : [
        `НЕ ПРОЙДЕН — ${MODE_LABELS[displayMetrics.mode]} · подключено ${displayMetrics.totalConnected}/${requestedBots || displayMetrics.totalConnected}`,
        hasConnectionErrors
          ? `ошибок подключения: ${displayMetrics.failedConnections}`
          : null,
        hasVerificationErrors
          ? `ошибок проверки: ${displayMetrics.incorrectResponses}`
          : null,
        !connectedAll ? "не все боты успели подключиться" : null,
      ]
        .filter(Boolean)
        .join(", ");

  useEffect(() => {
    const sample =
      running || displayMetrics.elapsedSeconds > 0
        ? Number(displayMetrics.messagesPerSecond.toFixed(2))
        : 0;

    setTrafficHistory((prev) => [...prev.slice(-(TRAFFIC_HISTORY_SIZE - 1)), sample]);
  }, [displayMetrics.elapsedSeconds, displayMetrics.messagesPerSecond, running]);

  useEffect(() => {
    if (!running && phase === "idle") {
      setTrafficHistory(Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0));
    }
  }, [phase, running]);

  const { line, area, last } = useMemo(
    () => buildSparkline(trafficHistory),
    [trafficHistory]
  );

  const trafficNow = trafficHistory[trafficHistory.length - 1] ?? 0;
  const trafficPeak = Math.max(...trafficHistory, 0);
  const visibleFeed = useMemo(() => feed.slice(0, 14), [feed]);
  const previewMessages = useMemo(() => feed.slice(0, 8), [feed]);
  const topologyBots = displayMetrics.botStatuses;
  const activeBots =
    topologyBots.length > 0
      ? topologyBots.filter((bot) => bot.status === "active").length
      : displayMetrics.activeClients;

  const metricCards = [
    {
      label: "активных",
      value: displayMetrics.activeClients,
      className: `${s.metricCard} ${s.metricCardGood}`,
      big: true,
    },
    {
      label: "pkt/s",
      value: displayMetrics.messagesPerSecond.toFixed(0),
      className: `${s.metricCard} ${s.metricCardAccent}`,
      big: true,
    },
    {
      label: "доставлено ботам",
      value: displayMetrics.messagesReceived,
      className: s.metricCard,
      big: false,
    },
    {
      label: "доставлено watcher-у",
      value: displayMetrics.watcherDeliveries,
      className:
        effectiveMode === "visible"
          ? `${s.metricCard} ${s.metricCardAccent}`
          : s.metricCard,
      big: false,
    },
    {
      label: "p50",
      value: `${displayMetrics.p50ResponseMs.toFixed(1)}мс`,
      className: s.metricCard,
      big: false,
    },
    {
      label: "p95",
      value: `${displayMetrics.p95ResponseMs.toFixed(1)}мс`,
      className: s.metricCard,
      big: false,
    },
    {
      label: "ответов сервера",
      value: displayMetrics.serverResponsesConfirmed,
      className: s.metricCard,
      big: false,
    },
    {
      label: "ошибок проверки",
      value: displayMetrics.incorrectResponses,
      className:
        displayMetrics.incorrectResponses > 0
          ? `${s.metricCard} ${s.metricCardWarn}`
          : `${s.metricCard} ${s.metricCardGood}`,
      big: false,
    },
  ];

  return (
    <div className={s.overlay}>
      <button className={s.backdrop} onClick={onClose} aria-label="Закрыть" />
      <section className={s.workspace} aria-label="Симуляция нагрузки">
        <div className={s.titlebar}>
          <div className={s.titlebarBrand}>
            <span className={s.titlebarPage}>Симуляция</span>
            <span className={`${s.sessionBadge} ${running ? s.sessionBadgeActive : ""}`}>
              {running ? "● ACTIVE" : "○ READY"}
            </span>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="Закрыть">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={s.columns}>
          <aside className={s.leftRail}>
            <div className={s.sectionLabel}>Управление</div>
            <div className={s.controlCard}>
              <div className={s.controlActions}>
                <button
                  className={`${s.primaryAction} ${running ? s.primaryActionRunning : ""}`}
                  onClick={running ? () => void stop() : handleStart}
                >
                  <span className={running ? s.primaryDot : s.primaryPlay} />
                  {running ? "Запущено" : "Запустить"}
                </button>
                <button
                  className={s.secondaryAction}
                  onClick={() => void stop()}
                  disabled={!running}
                >
                  Стоп
                </button>
              </div>

              <div className={`${s.miniInputGrid} ${s.miniInputGridSingle}`}>
                <label className={s.miniInput}>
                  <span className={s.miniInputLabel}>БОТОВ</span>
                  <input
                    className={s.miniInputValue}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    disabled={running}
                  />
                </label>
              </div>
            </div>

            <div className={s.sectionLabel}>Режим симуляции</div>
            <div className={s.profileStack}>
              <button
                type="button"
                className={`${s.profileCard} ${effectiveMode === "visible" ? s.profileCardActive : ""}`}
                onClick={() => setMode("visible")}
                disabled={running}
              >
                <div className={s.profileHead}>
                  <span
                    className={
                      effectiveMode === "visible" ? s.profileRadio : s.profileRadioMuted
                    }
                  />
                  <span className={s.profileName}>Visible</span>
                </div>
                <div className={s.profileDesc}>
                  Боты шлют реальные MESSAGE всем подключённым наблюдателям. Desktop/CLI видят метрики, Android видит сам поток.
                </div>
              </button>
              <button
                type="button"
                className={`${s.profileCard} ${effectiveMode === "benchmark" ? s.profileCardActive : ""}`}
                onClick={() => setMode("benchmark")}
                disabled={running}
              >
                <div className={s.profileHead}>
                  <span
                    className={
                      effectiveMode === "benchmark" ? s.profileRadio : s.profileRadioMuted
                    }
                  />
                  <span className={s.profileName}>Benchmark</span>
                </div>
                <div className={s.profileDesc}>
                  Только серверные метрики без watcher-потока. Чистый ceiling маршрутизации.
                </div>
              </button>
            </div>

            <div className={s.sectionLabel}>Срез</div>
            <div className={s.kpiStack}>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Режим</span>
                <span className={s.kpiValue}>{MODE_LABELS[effectiveMode]}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Фаза</span>
                <span className={s.kpiValue}>{PHASE_LABELS[phase] || phase}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Подключено</span>
                <span className={s.kpiValue}>
                  {displayMetrics.totalConnected}/{requestedBots || displayMetrics.totalConnected}
                </span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Watcher delivery</span>
                <span className={s.kpiValue}>{displayMetrics.watcherDeliveries}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Сообщений/сек</span>
                <span className={s.kpiValue}>{displayMetrics.messagesPerSecond.toFixed(1)}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>P95 RTT</span>
                <span className={s.kpiValue}>{displayMetrics.p95ResponseMs.toFixed(1)}мс</span>
              </div>
            </div>

            <div className={s.leftRailFooter}>
              <span className={`${s.streamDot} ${running ? s.streamDotActive : ""}`} />
              <div className={s.streamMeta}>
                <div className={s.streamTitle}>
                  {running ? MODE_LABELS[displayMetrics.mode] : "Готово к запуску"}
                </div>
                <div className={s.streamSub}>{trafficNow.toFixed(1)} pkt/s</div>
              </div>
              <button type="button" className={s.exitPanelBtn} onClick={onClose}>
                Вернуться
              </button>
            </div>
          </aside>

          <main className={s.centerStage}>
            <section className={s.topologyCard}>
              <div className={s.cardHeader}>
                <div>
                  <div className={s.sectionLabel}>Топология сети</div>
                  <div className={s.subtleLine}>
                    {activeBots} / {topologyBots.length || requestedBots} активных
                  </div>
                </div>
                <div className={s.legend}>
                  <span className={s.legendItem}>
                    <span className={`${s.legendDot} ${s.legendDotActive}`} />
                    active
                  </span>
                  <span className={s.legendItem}>
                    <span className={`${s.legendDot} ${s.legendDotPacket}`} />
                    packet
                  </span>
                  <span className={s.legendItem}>
                    <span className={`${s.legendDot} ${s.legendDotIdle}`} />
                    idle
                  </span>
                </div>
              </div>
              <div className={s.topologyStage}>
                {topologyBots.length === 0 ? (
                  <div className={s.topologyEmpty}>
                    {effectiveMode === "benchmark"
                      ? "Benchmark не mirror-ит watcher-поток и не стримит bot status."
                      : "Статусы ботов появятся после подключения visible-сессии."}
                  </div>
                ) : (
                  <TopologyView
                    bots={topologyBots}
                    elapsedSeconds={displayMetrics.elapsedSeconds}
                  />
                )}
              </div>
            </section>

            <section className={s.logCard}>
              <div className={s.logHeader}>
                <div className={s.sectionLabel}>Visible feed</div>
                <div className={s.logChips}>
                  <span className={`${s.logChip} ${s.logChipActive}`}>
                    {MODE_LABELS[effectiveMode]}
                  </span>
                  <span className={s.logHint}>
                    {effectiveMode === "visible" ? "real MESSAGE feed" : "metrics only"}
                  </span>
                </div>
              </div>
              <div className={s.logList}>
                {effectiveMode !== "visible" ? (
                  <div className={s.logEmpty}>
                    Benchmark не шлёт watcher-сообщения. Здесь остаётся только финальная метрика.
                  </div>
                ) : visibleFeed.length === 0 ? (
                  <div className={s.logEmpty}>
                    После старта сюда начнут приходить реальные MESSAGE пакеты от visible-ботов.
                  </div>
                ) : (
                  visibleFeed.map((item) => <FeedRow key={item.id} item={item} />)
                )}
              </div>
            </section>
          </main>

          <aside className={s.rightRail}>
            <div className={s.sectionLabel}>Метрики · live</div>
            <div className={s.metricsGrid}>
              {metricCards.map((item) => (
                <div className={item.className} key={item.label}>
                  <div className={item.big ? s.metricBig : s.metricValue}>{item.value}</div>
                  <div className={s.metricLabel}>{item.label}</div>
                </div>
              ))}
            </div>

            <div className={s.throughputCard}>
              <div className={s.cardHeader}>
                <span className={s.throughputTitle}>Пропускная способность</span>
                <span className={s.throughputSub}>60с</span>
              </div>
              <svg
                className={s.sparkSvg}
                width="100%"
                height="42"
                viewBox="0 0 240 42"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="simSparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
                    <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#simSparkGrad)" className={s.sparkArea} />
                <path d={line} fill="none" className={s.sparkLine} />
                <circle cx={last.x} cy={last.y} r="2.5" className={s.sparkDot} />
              </svg>
              <div className={s.throughputFooter}>
                <span>
                  now <span className={s.throughputValue}>{trafficNow.toFixed(1)} pkt/s</span>
                </span>
                <span>
                  peak <span className={s.throughputValue}>{trafficPeak.toFixed(1)} pkt/s</span>
                </span>
              </div>
            </div>

            <div className={s.previewCard}>
              <div className={s.previewHeader}>
                <span className={s.sectionLabel}>Последние сообщения</span>
                <span className={s.liveTag}>
                  {effectiveMode === "visible" ? "LIVE" : "OFF"}
                </span>
              </div>
              <div className={s.previewList}>
                {effectiveMode !== "visible" ? (
                  <div className={s.previewEmpty}>
                    В Benchmark watcher-поток отключён.
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className={s.previewEmpty}>
                    Первые mirrored сообщения появятся здесь после старта.
                  </div>
                ) : (
                  previewMessages.map((entry) => (
                    <div className={s.previewItem} key={`preview-${entry.id}`}>
                      <div className={s.previewAvatar}>
                        {entry.sender.slice(0, 2).toUpperCase()}
                      </div>
                      <div className={s.previewBody}>
                        <div className={s.previewMeta}>
                          <span className={s.previewBot}>{entry.sender}</span>
                          <span className={s.previewTime}>
                            {formatStamp(entry.timestampMs)}
                          </span>
                        </div>
                        <div className={s.previewBubble}>{entry.text}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {isDone && (
              <div className={`${s.resultBanner} ${passedResult ? s.resultPass : s.resultFail}`}>
                {resultText}
              </div>
            )}

            <div className={s.footerBadge}>
              <span className={`${s.footerDot} ${running ? s.footerDotActive : ""}`} />
              <span>
                {displayMetrics.elapsedSeconds > 0
                  ? `Сессия ${formatSession(displayMetrics.elapsedSeconds)}`
                  : "Ожидание запуска"}
              </span>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
