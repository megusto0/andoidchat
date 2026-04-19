import type { SimMetrics, SimulationFeedMessage } from "../types";

const MAX_SIMULATION_FEED = 320;

export const INITIAL_SIM_METRICS: SimMetrics = {
  requestedClients: 0,
  mode: "visible",
  activeClients: 0,
  totalConnected: 0,
  failedConnections: 0,
  messagesSent: 0,
  messagesReceived: 0,
  watcherDeliveries: 0,
  echoConfirmed: 0,
  serverResponsesConfirmed: 0,
  incorrectResponses: 0,
  avgResponseMs: 0,
  p50ResponseMs: 0,
  p95ResponseMs: 0,
  messagesPerSecond: 0,
  elapsedSeconds: 0,
  phase: "idle",
  botStatuses: [],
  passed: false,
};

export interface SimulationSnapshot {
  metrics: SimMetrics;
  result: SimMetrics | null;
  feed: SimulationFeedMessage[];
  hiddenFeedCount: number;
  anchorTimestampMs: number | null;
  running: boolean;
  simulationId: string | null;
}

type Listener = () => void;

let snapshot: SimulationSnapshot = {
  metrics: INITIAL_SIM_METRICS,
  result: null,
  feed: [],
  hiddenFeedCount: 0,
  anchorTimestampMs: null,
  running: false,
  simulationId: null,
};

const listeners = new Set<Listener>();
let pendingFeed: Omit<SimulationFeedMessage, "id">[] = [];
let feedFlushHandle: number | null = null;

function cloneMetrics(metrics: SimMetrics): SimMetrics {
  return {
    ...metrics,
    botStatuses: [...metrics.botStatuses],
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function cancelPendingFeedFlush() {
  if (feedFlushHandle !== null) {
    window.cancelAnimationFrame(feedFlushHandle);
    feedFlushHandle = null;
  }
}

function clearPendingFeed() {
  pendingFeed = [];
  cancelPendingFeedFlush();
}

function isRunningPhase(phase: string) {
  return phase !== "idle" && phase !== "done" && phase !== "cancelled";
}

export function getSimulationSnapshot(): SimulationSnapshot {
  return {
    metrics: cloneMetrics(snapshot.metrics),
    result: snapshot.result ? cloneMetrics(snapshot.result) : null,
    feed: [...snapshot.feed],
    hiddenFeedCount: snapshot.hiddenFeedCount,
    anchorTimestampMs: snapshot.anchorTimestampMs,
    running: snapshot.running,
    simulationId: snapshot.simulationId,
  };
}

export function subscribeSimulation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetSimulationState(
  preset?: Partial<Pick<SimMetrics, "mode" | "requestedClients">>
) {
  clearPendingFeed();
  snapshot = {
    metrics: {
      ...INITIAL_SIM_METRICS,
      ...preset,
    },
    result: null,
    feed: [],
    hiddenFeedCount: 0,
    anchorTimestampMs: null,
    running: false,
    simulationId: null,
  };
  emit();
}

export function pushSimulationMetrics(metrics: SimMetrics) {
  const shouldResetFeed =
    metrics.phase === "connecting" &&
    (snapshot.simulationId !== null ||
      snapshot.result !== null ||
      snapshot.metrics.phase === "done" ||
      snapshot.metrics.phase === "cancelled" ||
      snapshot.metrics.mode !== metrics.mode ||
      snapshot.metrics.requestedClients !== metrics.requestedClients);

  if (shouldResetFeed) {
    clearPendingFeed();
  }

  snapshot = {
    metrics: cloneMetrics(metrics),
    result: shouldResetFeed ? null : snapshot.result,
    feed: shouldResetFeed ? [] : snapshot.feed,
    hiddenFeedCount: shouldResetFeed ? 0 : snapshot.hiddenFeedCount,
    anchorTimestampMs: shouldResetFeed ? null : snapshot.anchorTimestampMs,
    running: isRunningPhase(metrics.phase),
    simulationId: shouldResetFeed ? null : snapshot.simulationId,
  };
  emit();
}

export function pushSimulationResult(result: SimMetrics) {
  snapshot = {
    metrics: cloneMetrics(result),
    result: cloneMetrics(result),
    feed: snapshot.feed,
    hiddenFeedCount: snapshot.hiddenFeedCount,
    anchorTimestampMs: snapshot.anchorTimestampMs,
    running: false,
    simulationId: snapshot.simulationId,
  };
  emit();
}

function flushPendingFeed() {
  feedFlushHandle = null;

  if (pendingFeed.length === 0) {
    return;
  }

  const queued = pendingFeed;
  pendingFeed = [];

  const currentSimulationId = snapshot.simulationId;
  const accepted = queued.filter(
    (message) =>
      currentSimulationId === null || message.simulationId === currentSimulationId
  );

  if (accepted.length === 0) {
    return;
  }

  accepted.sort((a, b) => b.timestampMs - a.timestampMs);

  const seen = new Set(snapshot.feed.map((item) => item.id));
  const additions: SimulationFeedMessage[] = [];

  for (const message of accepted) {
    const id = `${message.simulationId}:${message.sender}:${message.timestampMs}:${message.text}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    additions.push({ ...message, id });
  }

  if (additions.length === 0) {
    return;
  }

  let nextFeed = [...additions, ...snapshot.feed];
  let hiddenFeedCount = snapshot.hiddenFeedCount;
  if (nextFeed.length > MAX_SIMULATION_FEED) {
    hiddenFeedCount += nextFeed.length - MAX_SIMULATION_FEED;
    nextFeed = nextFeed.slice(0, MAX_SIMULATION_FEED);
  }

  const oldestAddition = additions[additions.length - 1];

  snapshot = {
    ...snapshot,
    feed: nextFeed,
    hiddenFeedCount,
    anchorTimestampMs:
      snapshot.anchorTimestampMs ?? oldestAddition?.timestampMs ?? null,
    simulationId: snapshot.simulationId ?? additions[0]?.simulationId ?? null,
  };
  emit();
}

function scheduleFeedFlush() {
  if (feedFlushHandle !== null) {
    return;
  }
  feedFlushHandle = window.requestAnimationFrame(flushPendingFeed);
}

export function pushSimulationFeedMessage(message: Omit<SimulationFeedMessage, "id">) {
  if (
    snapshot.simulationId !== null &&
    snapshot.simulationId !== message.simulationId
  ) {
    return;
  }

  pendingFeed.push(message);
  scheduleFeedFlush();
}
