import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSimulation } from "../hooks/useSimulation";
import type {
  SimBotStatus as BotStatus,
  SimulationFeedMessage,
  SimulationMode,
} from "../types";
import { formatSimulationSender } from "../utils/simulationNames";
import { Header } from "./Header";
import { StatusBadge } from "./StatusBadge";
import s from "./VisualizationPanel.module.css";

interface Props {
  onClose: () => void;
  onDisconnect: () => void;
  sendCommand: (raw: string) => Promise<void> | void;
}

type FeedFilter = "all" | "messages" | "server";

const TRAFFIC_HISTORY_SIZE = 40;
const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 42;
const SPARK_PADDING = 4;
const FEED_ROW_HEIGHT = 34;
const MAX_TOPOLOGY_BOTS = 64;
const TOPOLOGY_VIEWBOX_WIDTH = 520;
const TOPOLOGY_VIEWBOX_HEIGHT = 360;
const TOPOLOGY_CENTER_X = TOPOLOGY_VIEWBOX_WIDTH / 2;
const TOPOLOGY_CENTER_Y = TOPOLOGY_VIEWBOX_HEIGHT / 2;
const TOPOLOGY_RING_RADII = [82, 128, 174, 220];
const TOPOLOGY_RING_CAPACITY = [10, 14, 18, 22];

const PHASE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  connecting: "Подключение",
  messaging: "Работа",
  disconnecting: "Отключение",
  done: "Завершено",
  cancelled: "Остановлено",
};

const MODE_LABELS: Record<SimulationMode, string> = {
  visible: "Наблюдение",
  benchmark: "Нагрузка",
};

const MODE_CODES: Record<SimulationMode, string> = {
  visible: "VISIBLE",
  benchmark: "BENCHMARK",
};

function formatSession(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const totalSec = Math.floor(totalMs / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function formatRelativeStamp(timestampMs: number, anchorTimestampMs: number | null) {
  const deltaMs = Math.max(0, timestampMs - (anchorTimestampMs ?? timestampMs));
  const totalSeconds = Math.floor(deltaMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const millis = String(deltaMs % 1000).padStart(3, "0");
  return `+${minutes}:${seconds}.${millis}`;
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

function statusLineClass(status: BotStatus["status"]) {
  if (status === "active") return s.topologyLineActive;
  if (status === "connecting") return s.topologyLineConnecting;
  return "";
}

function statusNodeClass(status: BotStatus["status"]) {
  if (status === "active") return s.topologyNodeActive;
  if (status === "connecting") return s.topologyNodeConnecting;
  if (status === "error") return s.topologyNodeError;
  return s.topologyNodeDone;
}

function nodeRadius(status: BotStatus["status"]) {
  if (status === "active") return 6.2;
  if (status === "connecting") return 5.2;
  if (status === "error") return 5.2;
  return 4.1;
}

function labelStride(total: number) {
  if (total <= 16) return 1;
  if (total <= 28) return 2;
  if (total <= 44) return 3;
  return 4;
}

function TopologyView({
  bots,
  elapsedSeconds,
}: {
  bots: BotStatus[];
  elapsedSeconds: number;
}) {
  const visible = bots.slice(0, MAX_TOPOLOGY_BOTS);
  const hiddenCount = Math.max(0, bots.length - visible.length);
  const stride = labelStride(visible.length);
  const ringDefs: Array<{ radius: number; bots: BotStatus[] }> = [];
  let offset = 0;

  for (let ringIndex = 0; ringIndex < TOPOLOGY_RING_RADII.length; ringIndex += 1) {
    if (offset >= visible.length) break;
    const ringCount = Math.min(
      TOPOLOGY_RING_CAPACITY[ringIndex],
      visible.length - offset
    );
    ringDefs.push({
      radius: TOPOLOGY_RING_RADII[ringIndex],
      bots: visible.slice(offset, offset + ringCount),
    });
    offset += ringCount;
  }

  const nodes = ringDefs.flatMap((ring, ringIndex) =>
    ring.bots.map((bot, localIndex) => {
      const globalIndex = ringDefs
        .slice(0, ringIndex)
        .reduce((sum, current) => sum + current.bots.length, 0) + localIndex;
      const rotationDirection = ringIndex % 2 === 0 ? 1 : -1;
      const rotation =
        elapsedSeconds * (0.12 - ringIndex * 0.018) * rotationDirection;
      const angle =
        rotation +
        (localIndex / Math.max(ring.bots.length, 1)) * Math.PI * 2 -
        Math.PI / 2;
      const breathing =
        bot.status === "active"
          ? Math.sin(elapsedSeconds * 1.6 + globalIndex * 0.42) * 4
          : bot.status === "connecting"
            ? Math.sin(elapsedSeconds * 2.2 + globalIndex * 0.38) * 6
            : bot.status === "error"
              ? Math.sin(elapsedSeconds * 1.9 + globalIndex * 0.25) * 2.5
              : Math.sin(elapsedSeconds * 1.1 + globalIndex * 0.19) * 1.5;
      const orbitRadius = ring.radius + breathing;
      const x = TOPOLOGY_CENTER_X + Math.cos(angle) * orbitRadius;
      const y = TOPOLOGY_CENTER_Y + Math.sin(angle) * orbitRadius;
      const showLabel =
        stride === 1 ||
        bot.status === "error" ||
        (bot.status === "active" && ringIndex === 0) ||
        globalIndex % stride === 0;

      return {
        bot,
        x,
        y,
        labelY: y + (y > TOPOLOGY_CENTER_Y ? 20 : -14),
        radius: nodeRadius(bot.status),
        ringIndex,
        showLabel,
      };
    })
  );

  const activeNodes = nodes.filter((node) => node.bot.status === "active");
  const connectingNodes = nodes.filter(
    (node) => node.bot.status === "connecting"
  );
  const packets = activeNodes
    .slice(0, activeNodes.length <= 14 ? 24 : 18)
    .flatMap((node, index) => {
      const streams = activeNodes.length <= 10 ? 2 : 1;

      return Array.from({ length: streams }, (_, streamIndex) => {
        const progress =
          ((elapsedSeconds * (0.3 + (index % 4) * 0.035) +
            index * 0.09 +
            streamIndex * 0.44) %
            1 +
            1) %
          1;
        const pulse =
          0.55 +
          0.45 * Math.sin(elapsedSeconds * 4.8 + index * 0.6 + streamIndex);

        return {
          id: `${node.bot.name}:${streamIndex}`,
          x:
            TOPOLOGY_CENTER_X +
            (node.x - TOPOLOGY_CENTER_X) * progress,
          y:
            TOPOLOGY_CENTER_Y +
            (node.y - TOPOLOGY_CENTER_Y) * progress,
          r: 1.9 + pulse * 1.2,
          opacity: 0.28 + progress * 0.58,
        };
      });
    });
  const serverPulse = 18 + ((elapsedSeconds * 1.45) % 1) * 34;

  return (
    <svg
      className={s.topologySvg}
      viewBox={`0 0 ${TOPOLOGY_VIEWBOX_WIDTH} ${TOPOLOGY_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="simServerGlow" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="simPacketTrail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.05" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.65" />
        </linearGradient>
      </defs>

      {ringDefs.map((ring, index) => (
        <circle
          key={`orbit-${index}`}
          cx={TOPOLOGY_CENTER_X}
          cy={TOPOLOGY_CENTER_Y}
          r={ring.radius}
          className={s.topologyOrbit}
        />
      ))}

      <circle
        cx={TOPOLOGY_CENTER_X}
        cy={TOPOLOGY_CENTER_Y}
        r={serverPulse}
        className={s.topologyServerAura}
      />
      <circle
        cx={TOPOLOGY_CENTER_X}
        cy={TOPOLOGY_CENTER_Y}
        r="52"
        fill="url(#simServerGlow)"
      />

      {nodes.map((node) => (
        <g key={node.bot.name}>
          <line
            x1={TOPOLOGY_CENTER_X}
            y1={TOPOLOGY_CENTER_Y}
            x2={node.x}
            y2={node.y}
            className={`${s.topologyLine} ${statusLineClass(node.bot.status)}`}
          />
          {node.bot.status !== "done" && (
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius + 5.5 + Math.max(0, Math.sin(elapsedSeconds * 2 + node.ringIndex))}
              className={s.topologyNodeHalo}
            />
          )}
          <circle
            cx={node.x}
            cy={node.y}
            r={node.radius}
            className={`${s.topologyNode} ${statusNodeClass(node.bot.status)}`}
          />
          {node.bot.status === "connecting" && (
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius + 7 + ((elapsedSeconds * 3.2 + node.ringIndex) % 4.2)}
              className={s.topologyPulseRing}
            />
          )}
          {node.showLabel && (
            <text
              x={node.x}
              y={node.labelY}
              className={s.topologyLabel}
            >
              {formatSimulationSender(node.bot.name, true)}
            </text>
          )}
          <title>
            {formatSimulationSender(node.bot.name, true)} · {node.bot.status} · {node.bot.messagesSent} сообщ.
          </title>
        </g>
      ))}

      {packets.map((packet) => (
        <g key={`packet-${packet.id}`}>
          <line
            x1={TOPOLOGY_CENTER_X}
            y1={TOPOLOGY_CENTER_Y}
            x2={packet.x}
            y2={packet.y}
            className={s.topologyPacketTrail}
          />
          <circle
            cx={packet.x}
            cy={packet.y}
            r={packet.r}
            className={s.topologyPacket}
            style={{ opacity: packet.opacity }}
          />
        </g>
      ))}

      {connectingNodes.map((node) => (
        <circle
          key={`scan-${node.bot.name}`}
          cx={node.x}
          cy={node.y}
          r={node.radius + 10}
          className={s.topologyConnectingScan}
        />
      ))}

      <circle
        cx={TOPOLOGY_CENTER_X}
        cy={TOPOLOGY_CENTER_Y}
        r="24"
        className={s.topologyServerCore}
      />
      <circle
        cx={TOPOLOGY_CENTER_X}
        cy={TOPOLOGY_CENTER_Y}
        r="16"
        className={s.topologyServer}
      />
      <text
        x={TOPOLOGY_CENTER_X}
        y={TOPOLOGY_CENTER_Y - 4}
        className={s.topologyServerText}
      >
        SERVER
      </text>
      <text
        x={TOPOLOGY_CENTER_X}
        y={TOPOLOGY_CENTER_Y + 18}
        className={s.topologyServerSubtext}
      >
        {activeNodes.length} live
      </text>

      {hiddenCount > 0 && (
        <g transform={`translate(${TOPOLOGY_VIEWBOX_WIDTH - 118} 18)`}>
          <rect
            className={s.topologyCountBadge}
            width="98"
            height="28"
            rx="14"
          />
          <text x="49" y="18" className={s.topologyCountText}>
            +{hiddenCount} hidden
          </text>
        </g>
      )}
    </svg>
  );
}

function FeedRow({
  item,
  anchorTimestampMs,
}: {
  item: SimulationFeedMessage;
  anchorTimestampMs: number | null;
}) {
  const isServer = item.sender === "Server";
  const shortName = formatSimulationSender(item.sender, !isServer);

  return (
    <div className={s.logItem} title={`${item.sender} · ${item.text}`}>
      <span className={s.logTime}>
        {formatRelativeStamp(item.timestampMs, anchorTimestampMs)}
      </span>
      <span className={`${s.logTag} ${isServer ? s.logTagServer : s.logTagBot}`}>
        {isServer ? "SERVER" : "MSG"}
      </span>
      <span className={s.logBot}>{shortName}</span>
      <span className={s.logText}>{item.text}</span>
    </div>
  );
}

export function VisualizationPanel({
  onClose,
  onDisconnect,
  sendCommand,
}: Props) {
  const {
    metrics,
    result,
    feed,
    hiddenFeedCount,
    anchorTimestampMs,
    running,
    mode,
    setMode,
    start,
    stop,
    isDone,
    passed,
  } = useSimulation(sendCommand);
  const [count, setCount] = useState("55");
  const [trafficHistory, setTrafficHistory] = useState<number[]>(
    Array.from({ length: TRAFFIC_HISTORY_SIZE }, () => 0)
  );
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const feedParentRef = useRef<HTMLDivElement>(null);

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
  const sessionMode =
    running ? metrics.mode : result?.mode ?? displayMetrics.mode ?? mode;
  const selectedMode = running ? metrics.mode : mode;
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
  const wasCancelled = phase === "cancelled";

  const resultText = wasCancelled
    ? "Симуляция остановлена вручную."
    : passedResult
      ? `Подключено ${displayMetrics.totalConnected}/${requestedBots || displayMetrics.totalConnected}`
      : [
          `Подключено ${displayMetrics.totalConnected}/${requestedBots || displayMetrics.totalConnected}`,
          hasConnectionErrors
            ? `ошибки подключения ${displayMetrics.failedConnections}`
            : null,
          hasVerificationErrors
            ? `ошибки проверки ${displayMetrics.incorrectResponses}`
            : null,
          !connectedAll ? "не все боты подключились" : null,
        ]
          .filter(Boolean)
          .join(" · ");

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

  const filteredFeed = useMemo(() => {
    if (feedFilter === "server") {
      return feed.filter((item) => item.sender === "Server");
    }
    if (feedFilter === "messages") {
      return feed.filter((item) => item.sender !== "Server");
    }
    return feed;
  }, [feed, feedFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredFeed.length,
    getScrollElement: () => feedParentRef.current,
    estimateSize: () => FEED_ROW_HEIGHT,
    overscan: 12,
  });

  const { line, area, last } = useMemo(
    () => buildSparkline(trafficHistory),
    [trafficHistory]
  );

  const trafficNow = trafficHistory[trafficHistory.length - 1] ?? 0;
  const trafficPeak = Math.max(...trafficHistory, 0);
  const topologyBots = displayMetrics.botStatuses;
  const shownTopologyBots = Math.min(topologyBots.length, MAX_TOPOLOGY_BOTS);
  const hiddenTopologyBots = Math.max(0, topologyBots.length - shownTopologyBots);
  const activeBots =
    topologyBots.length > 0
      ? topologyBots.filter((bot) => bot.status === "active").length
      : displayMetrics.activeClients;

  const deliveryPercent = displayMetrics.messagesSent
    ? Math.round((displayMetrics.echoConfirmed / displayMetrics.messagesSent) * 100)
    : 0;
  const lossCount =
    displayMetrics.failedConnections + displayMetrics.incorrectResponses;

  const metricCards = [
    {
      label: "активные",
      value: displayMetrics.activeClients,
      className: `${s.metricCard} ${s.metricCardGood}`,
    },
    {
      label: "pkt/s",
      value: displayMetrics.messagesPerSecond.toFixed(0),
      className: `${s.metricCard} ${s.metricCardAccent}`,
    },
    {
      label: "доставка",
      value: `${deliveryPercent}%`,
      className: `${s.metricCard} ${deliveryPercent >= 95 ? s.metricCardGood : ""}`,
    },
    {
      label: "p50",
      value: `${displayMetrics.p50ResponseMs.toFixed(1)}мс`,
      className: s.metricCard,
    },
    {
      label: "p95",
      value: `${displayMetrics.p95ResponseMs.toFixed(1)}мс`,
      className: s.metricCard,
    },
    {
      label: "потери",
      value: lossCount,
      className:
        lossCount > 0
          ? `${s.metricCard} ${s.metricCardWarn}`
          : `${s.metricCard} ${s.metricCardGood}`,
    },
  ];

  const detailRows = [
    { label: "Отправлено ботами", value: displayMetrics.messagesSent },
    { label: "Доставлено пакетов", value: displayMetrics.messagesReceived },
    { label: "Watcher delivery", value: displayMetrics.watcherDeliveries },
    { label: "Подтверждено ACK", value: displayMetrics.echoConfirmed },
    {
      label: "Ответов сервера",
      value: displayMetrics.serverResponsesConfirmed,
    },
  ];

  const feedFilters: Array<{ key: FeedFilter; label: string }> = [
    { key: "all", label: "Все" },
    { key: "messages", label: "Сообщения" },
    { key: "server", label: "Server" },
  ];

  return (
    <section className={s.overlay} aria-label="Симуляция нагрузки">
      <div className={s.workspace}>
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
                className={`${s.profileCard} ${selectedMode === "visible" ? s.profileCardActive : ""}`}
                onClick={() => setMode("visible")}
                disabled={running}
              >
                <div className={s.profileHead}>
                  <span
                    className={
                      selectedMode === "visible" ? s.profileRadio : s.profileRadioMuted
                    }
                  />
                  <span className={s.profileName}>Наблюдение</span>
                  <span className={s.profileCode}>{MODE_CODES.visible}</span>
                </div>
                <div className={s.profileDesc}>
                  Реальный watcher-поток для desktop, CLI и Android. Видна разница по клиентам.
                </div>
              </button>
              <button
                type="button"
                className={`${s.profileCard} ${selectedMode === "benchmark" ? s.profileCardActive : ""}`}
                onClick={() => setMode("benchmark")}
                disabled={running}
              >
                <div className={s.profileHead}>
                  <span
                    className={
                      selectedMode === "benchmark" ? s.profileRadio : s.profileRadioMuted
                    }
                  />
                  <span className={s.profileName}>Нагрузка</span>
                  <span className={s.profileCode}>{MODE_CODES.benchmark}</span>
                </div>
                <div className={s.profileDesc}>
                  Серверная оценка без watcher-feed. Чистый ceiling маршрутизации.
                </div>
              </button>
            </div>
            {!running && selectedMode !== sessionMode && (
              <div className={s.modeHint}>
                Следующий запуск: {MODE_LABELS[selectedMode]}
              </div>
            )}

            <div className={s.sectionLabel}>Сессия</div>
            <div className={s.kpiStack}>
              <div className={s.kpiRow}>
                <span className={s.kpiLabel}>Режим</span>
                <span className={s.kpiValue}>{MODE_LABELS[sessionMode]}</span>
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
                <span className={s.kpiLabel}>Длительность</span>
                <span className={s.kpiValue}>{formatSession(displayMetrics.elapsedSeconds)}</span>
              </div>
            </div>

            <div className={s.leftRailFooter}>
              <StatusBadge variant={running ? "active" : "ready"}>
                {running ? "Активно" : "Готов"}
              </StatusBadge>
              <div className={s.streamMeta}>
                <div className={s.streamTitle}>{MODE_LABELS[selectedMode]}</div>
                <div className={s.streamSub}>
                  {selectedMode === "visible"
                    ? "Watcher-поток активен только в visible"
                    : "Watcher-поток отключён"}
                </div>
              </div>
            </div>
          </aside>

          <main className={s.centerStage}>
            <section className={s.topologyCard}>
              <div className={s.cardHeader}>
                <div>
                  <div className={s.sectionLabel}>Топология сети</div>
                  <div className={s.subtleLine}>
                    {activeBots} / {topologyBots.length || requestedBots} активных
                    {topologyBots.length > 0 ? ` · показано ${shownTopologyBots}` : ""}
                    {hiddenTopologyBots > 0 ? ` · скрыто ${hiddenTopologyBots}` : ""}
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
                    {sessionMode === "benchmark"
                      ? "В benchmark бот-статусы не стримятся в watcher-UI."
                      : "Статусы появятся после старта visible-сессии."}
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
                <div>
                  <div className={s.sectionLabel}>Поток</div>
                  <div className={s.logSubhead}>
                    {sessionMode === "visible"
                      ? "Реальные mirrored MESSAGE watcher-потока"
                      : "Benchmark не отправляет watcher-feed"}
                  </div>
                </div>
                <div className={s.logChips}>
                  {feedFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`${s.logChip} ${feedFilter === filter.key ? s.logChipActive : ""}`}
                      onClick={() => setFeedFilter(filter.key)}
                      disabled={sessionMode !== "visible"}
                    >
                      {filter.label}
                    </button>
                  ))}
                  {hiddenFeedCount > 0 && (
                    <span className={s.logOverflow}>+{hiddenFeedCount} скрыто</span>
                  )}
                </div>
              </div>
              <div className={s.logViewport} ref={feedParentRef}>
                {sessionMode !== "visible" ? (
                  <div className={s.logEmpty}>
                    В режиме «Нагрузка» UI не получает watcher-поток и показывает только метрики.
                  </div>
                ) : filteredFeed.length === 0 ? (
                  <div className={s.logEmpty}>
                    После запуска сюда начнут поступать реальные сообщения симуляции.
                  </div>
                ) : (
                  <div
                    className={s.logCanvas}
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = filteredFeed[virtualRow.index];

                      return (
                        <div
                          key={item.id}
                          className={s.logRow}
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          <FeedRow
                            item={item}
                            anchorTimestampMs={anchorTimestampMs}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </main>

          <aside className={s.rightRail}>
            <div className={s.rightRailHeader}>
              <div className={s.sectionLabel}>Метрики</div>
              <Header
                showVisualization={true}
                onToggleVisualization={onClose}
                onDisconnect={onDisconnect}
              />
            </div>
            <div className={s.metricsGrid}>
              {metricCards.map((item) => (
                <div className={item.className} key={item.label}>
                  <div className={s.metricBig}>{item.value}</div>
                  <div className={s.metricLabel}>{item.label}</div>
                </div>
              ))}
            </div>

            <div className={s.throughputCard}>
              <div className={s.cardHeader}>
                <span className={s.throughputTitle}>Пропускная способность</span>
                <StatusBadge variant={running ? "live" : "ready"}>
                  {running ? "Live" : "Готов"}
                </StatusBadge>
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

            <div className={s.detailCard}>
              <div className={s.detailHeader}>
                <span className={s.sectionLabel}>Детали</span>
              </div>
              <div className={s.detailRows}>
                {detailRows.map((item) => (
                  <div className={s.detailRow} key={item.label}>
                    <span className={s.detailLabel}>{item.label}</span>
                    <span className={s.detailValue}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {isDone && (
              <div
                className={`${s.resultBanner} ${
                  wasCancelled
                    ? s.resultNeutral
                    : passedResult
                      ? s.resultPass
                      : s.resultFail
                }`}
              >
                <StatusBadge
                  variant={wasCancelled ? "ready" : passedResult ? "ok" : "error"}
                >
                  {wasCancelled
                    ? "Остановлено"
                    : passedResult
                      ? "Пройден"
                      : "Не пройден"}
                </StatusBadge>
                <span className={s.resultText}>{resultText}</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
