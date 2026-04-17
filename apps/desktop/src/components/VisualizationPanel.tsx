import { useEffect, useMemo, useRef, useState } from "react";
import { useSimulation, type BotStatus } from "../hooks/useSimulation";
import s from "./VisualizationPanel.module.css";

interface Props {
  onClose: () => void;
}

type EventKind = "SYS" | "JOIN" | "MSG" | "LEAVE" | "ERR";

interface EventEntry {
  id: string;
  kind: EventKind;
  bot?: string;
  text: string;
  seconds: number;
}

const TRAFFIC_HISTORY_SIZE = 40;
const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 42;
const SPARK_PADDING = 4;

const PHASE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  connecting: "Подключение",
  messaging: "Нагрузка",
  disconnecting: "Отключение",
  done: "Завершено",
};

function formatSession(seconds: number) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}м ${sec}с`;
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

function buildBotMessage(botName: string, sentCount: number) {
  const sequence = Math.max(0, sentCount - 1);
  switch (sequence % 5) {
    case 0:
      return `Обычное сообщение ${sequence + 1} от ${botName}`;
    case 1:
      return `Проверка <@> Anna шалаш madam radar test #${sequence + 1}`;
    case 2:
      return `Нагрузка от ${botName} — сообщение ${sequence + 1}`;
    case 3:
      return `Тест <@> Anna test ${sequence + 1}`;
    default:
      return `Стабильный поток от ${botName} #${sequence + 1}`;
  }
}

function pushEvents(
  current: EventEntry[],
  additions: EventEntry[],
  limit = 28
) {
  if (additions.length === 0) {
    return current;
  }
  return [...additions.reverse(), ...current].slice(0, limit);
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

export function VisualizationPanel({ onClose }: Props) {
  const { metrics, running, start, stop, isDone } = useSimulation();
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("5000");
  const [count, setCount] = useState("55");
  const [trafficHistory, setTrafficHistory] = useState<number[]>(
    Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0)
  );
  const [events, setEvents] = useState<EventEntry[]>([]);
  const previousPhaseRef = useRef<string>("idle");
  const previousBotsRef = useRef<Map<string, BotStatus>>(new Map());

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
    start(host, Number(port), Number(count));
    setEvents([]);
  }

  const phase = metrics.phase || "idle";
  const requestedBots = Math.max(0, Number(count) || 0);
  const connectedAll = requestedBots === 0 || metrics.totalConnected >= requestedBots;
  const hasVerificationErrors = metrics.incorrectResponses > 0;
  const hasConnectionErrors = metrics.failedConnections > 0;
  const passedResult =
    isDone &&
    connectedAll &&
    !hasConnectionErrors &&
    !hasVerificationErrors;

  const deliveryPercent =
    metrics.messagesSent > 0
      ? (metrics.echoConfirmed / metrics.messagesSent) * 100
      : 100;

  const lossPercent =
    metrics.messagesSent > 0
      ? (metrics.incorrectResponses / metrics.messagesSent) * 100
      : 0;

  const resultText = passedResult
    ? `ПРОЙДЕН — подключено ${metrics.totalConnected}/${requestedBots || metrics.totalConnected}, ошибок проверки нет`
    : [
        `НЕ ПРОЙДЕН — подключено ${metrics.totalConnected}/${requestedBots || metrics.totalConnected}`,
        hasConnectionErrors
          ? `ошибок подключения: ${metrics.failedConnections}`
          : null,
        hasVerificationErrors
          ? `ошибок проверки ответа: ${metrics.incorrectResponses}`
          : null,
        !connectedAll
          ? `не все боты успели подключиться`
          : null,
      ]
        .filter(Boolean)
        .join(", ");

  useEffect(() => {
    const sample =
      running || metrics.elapsedSeconds > 0
        ? Number(metrics.messagesPerSecond.toFixed(2))
        : 0;

    setTrafficHistory((prev) => [...prev.slice(-(TRAFFIC_HISTORY_SIZE - 1)), sample]);
  }, [metrics.messagesPerSecond, metrics.elapsedSeconds, running]);

  useEffect(() => {
    if (!running && phase === "idle") {
      setTrafficHistory(Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0));
      previousBotsRef.current = new Map();
      previousPhaseRef.current = "idle";
    }
  }, [phase, running]);

  useEffect(() => {
    const additions: EventEntry[] = [];
    const previousPhase = previousPhaseRef.current;
    if (phase !== previousPhase) {
      const label = PHASE_LABELS[phase] || phase;
      additions.push({
        id: `phase-${phase}-${metrics.elapsedSeconds}`,
        kind: "SYS",
        text: `Стадия симуляции: ${label}`,
        seconds: metrics.elapsedSeconds,
      });
      previousPhaseRef.current = phase;
    }

    const previousBots = previousBotsRef.current;
    const nextBots = new Map<string, BotStatus>();

    for (const bot of metrics.botStatuses) {
      const previous = previousBots.get(bot.name);
      nextBots.set(bot.name, bot);

      if (previous && previous.status !== bot.status) {
        if (bot.status === "active") {
          additions.push({
            id: `join-${bot.name}-${metrics.elapsedSeconds}`,
            kind: "JOIN",
            bot: bot.name,
            text: "присоединился к нагрузке",
            seconds: metrics.elapsedSeconds,
          });
        } else if (bot.status === "done") {
          additions.push({
            id: `leave-${bot.name}-${metrics.elapsedSeconds}`,
            kind: "LEAVE",
            bot: bot.name,
            text: "отключился",
            seconds: metrics.elapsedSeconds,
          });
        } else if (bot.status === "error") {
          additions.push({
            id: `error-${bot.name}-${metrics.elapsedSeconds}`,
            kind: "ERR",
            bot: bot.name,
            text: "ошибка соединения или доставки",
            seconds: metrics.elapsedSeconds,
          });
        }
      }

      if (bot.messagesSent > (previous?.messagesSent ?? 0)) {
        additions.push({
          id: `msg-${bot.name}-${bot.messagesSent}-${metrics.elapsedSeconds}`,
          kind: "MSG",
          bot: bot.name,
          text: buildBotMessage(bot.name, bot.messagesSent),
          seconds: metrics.elapsedSeconds,
        });
      }
    }

    previousBotsRef.current = nextBots;
    setEvents((current) => pushEvents(current, additions));
  }, [metrics.botStatuses, metrics.elapsedSeconds, phase]);

  const { line, area, last } = useMemo(
    () => buildSparkline(trafficHistory),
    [trafficHistory]
  );

  const trafficNow = trafficHistory[trafficHistory.length - 1] ?? 0;
  const trafficPeak = Math.max(...trafficHistory, 0);

  const previewMessages = useMemo(
    () =>
      events
        .filter((event) => event.kind === "MSG" && event.bot)
        .slice(0, 8),
    [events]
  );

  const activeBots = metrics.botStatuses.filter((bot) => bot.status === "active").length;

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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  onClick={running ? stop : handleStart}
                >
                  <span className={running ? s.primaryDot : s.primaryPlay} />
                  {running ? "Запущено" : "Запустить"}
                </button>
                <button
                  className={s.secondaryAction}
                  onClick={stop}
                  disabled={!running}
                >
                  Стоп
                </button>
              </div>

              <div className={s.miniInputGrid}>
                <label className={s.miniInput}>
                  <span className={s.miniInputLabel}>HOST</span>
                  <input
                    className={s.miniInputValue}
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    disabled={running}
                  />
                </label>
                <label className={s.miniInput}>
                  <span className={s.miniInputLabel}>PORT</span>
                  <input
                    className={s.miniInputValue}
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    disabled={running}
                  />
                </label>
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

            <div className={s.sectionLabel}>Профиль нагрузки</div>
            <div className={s.profileStack}>
              <div className={`${s.profileCard} ${s.profileCardActive}`}>
                <div className={s.profileHead}>
                  <span className={s.profileRadio} />
                  <span className={s.profileName}>Стресс-тест</span>
                </div>
                <div className={s.profileDesc}>
                  Массовый broadcast с проверкой отклика и server-response.
                </div>
              </div>
              <div className={s.profileCard}>
                <div className={s.profileHead}>
                  <span className={s.profileRadioMuted} />
                  <span className={s.profileName}>Группа</span>
                </div>
                <div className={s.profileDesc}>
                  Подготовлено для следующего шага: custom-target сценарии.
                </div>
              </div>
            </div>

            <div className={s.sectionLabel}>Поток</div>
            <div className={s.kpiStack}>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Фаза</span>
                <span className={s.kpiValue}>{PHASE_LABELS[phase] || phase}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Подключено</span>
                <span className={s.kpiValue}>
                  {metrics.totalConnected}/{requestedBots || metrics.totalConnected}
                </span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Сообщений/сек</span>
                <span className={s.kpiValue}>{metrics.messagesPerSecond.toFixed(1)}</span>
              </div>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Средний RTT</span>
                <span className={s.kpiValue}>{metrics.avgResponseMs.toFixed(1)}мс</span>
              </div>
            </div>

            <div className={s.leftRailFooter}>
              <span className={`${s.streamDot} ${running ? s.streamDotActive : ""}`} />
              <div className={s.streamMeta}>
                <div className={s.streamTitle}>
                  {running ? "Отправка сообщений" : "Готово к запуску"}
                </div>
                <div className={s.streamSub}>
                  {trafficNow.toFixed(1)} pkt/s
                </div>
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
                    {activeBots} / {metrics.botStatuses.length || requestedBots} активных
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
                <TopologyView
                  bots={metrics.botStatuses}
                  elapsedSeconds={metrics.elapsedSeconds}
                />
              </div>
            </section>

            <section className={s.logCard}>
              <div className={s.logHeader}>
                <div className={s.sectionLabel}>Журнал событий</div>
                <div className={s.logChips}>
                  <span className={`${s.logChip} ${s.logChipActive}`}>Все</span>
                  <span className={s.logChip}>Подключения</span>
                  <span className={s.logChip}>Сообщения</span>
                  <span className={s.logHint}>⏬ авто-скролл</span>
                </div>
              </div>
              <div className={s.logList}>
                {events.length === 0 ? (
                  <div className={s.logEmpty}>
                    События появятся после запуска симуляции.
                  </div>
                ) : (
                  events.map((event) => (
                    <div className={s.logItem} key={event.id}>
                      <span className={s.logTime}>
                        -{Math.max(0, Math.floor(event.seconds))}с
                      </span>
                      <span className={`${s.logTag} ${s[`logTag${event.kind}`]}`}>
                        {event.kind}
                      </span>
                      <span className={s.logBot}>{event.bot ?? "system"}</span>
                      <span className={s.logText}>{event.text}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>

          <aside className={s.rightRail}>
            <div className={s.sectionLabel}>Метрики · live</div>
            <div className={s.metricsGrid}>
              <div className={`${s.metricCard} ${s.metricCardGood}`}>
                <div className={s.metricBig}>{metrics.activeClients}</div>
                <div className={s.metricLabel}>активных</div>
              </div>
              <div className={`${s.metricCard} ${s.metricCardAccent}`}>
                <div className={s.metricBig}>{metrics.messagesPerSecond.toFixed(0)}</div>
                <div className={s.metricLabel}>pkt/s</div>
              </div>
              <div className={s.metricCard}>
                <div className={s.metricValue}>{deliveryPercent.toFixed(1)}%</div>
                <div className={s.metricLabel}>доставка</div>
              </div>
              <div className={s.metricCard}>
                <div className={s.metricValue}>{metrics.p50ResponseMs.toFixed(1)}мс</div>
                <div className={s.metricLabel}>p50</div>
              </div>
              <div className={s.metricCard}>
                <div className={s.metricValue}>{metrics.p95ResponseMs.toFixed(1)}мс</div>
                <div className={s.metricLabel}>p95</div>
              </div>
              <div className={`${s.metricCard} ${lossPercent > 0 ? s.metricCardWarn : ""}`}>
                <div className={s.metricValue}>{lossPercent.toFixed(1)}%</div>
                <div className={s.metricLabel}>потери</div>
              </div>
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
                <span className={s.sectionLabel}>Чат · General</span>
                <span className={s.liveTag}>LIVE</span>
              </div>
              <div className={s.previewList}>
                {previewMessages.length === 0 ? (
                  <div className={s.previewEmpty}>
                    Здесь появятся последние сообщения ботов.
                  </div>
                ) : (
                  previewMessages.map((entry) => (
                    <div className={s.previewItem} key={`preview-${entry.id}`}>
                      <div className={s.previewAvatar}>
                        {entry.bot?.slice(-2).toUpperCase()}
                      </div>
                      <div className={s.previewBody}>
                        <div className={s.previewMeta}>
                          <span className={s.previewBot}>{entry.bot}</span>
                          <span className={s.previewTime}>
                            -{Math.max(0, Math.floor(entry.seconds))}с
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
                {metrics.elapsedSeconds > 0
                  ? `Сессия ${formatSession(metrics.elapsedSeconds)}`
                  : "Ожидание запуска"}
              </span>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
