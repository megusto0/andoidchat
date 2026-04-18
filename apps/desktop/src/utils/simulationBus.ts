import type { SimMetrics, SimulationFeedMessage } from "../types";

const MAX_SIMULATION_FEED = 40;

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
  running: boolean;
  simulationId: string | null;
}

type Listener = () => void;

let snapshot: SimulationSnapshot = {
  metrics: INITIAL_SIM_METRICS,
  result: null,
  feed: [],
  running: false,
  simulationId: null,
};

const listeners = new Set<Listener>();

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

function isRunningPhase(phase: string) {
  return phase !== "idle" && phase !== "done" && phase !== "cancelled";
}

export function getSimulationSnapshot(): SimulationSnapshot {
  return {
    metrics: cloneMetrics(snapshot.metrics),
    result: snapshot.result ? cloneMetrics(snapshot.result) : null,
    feed: [...snapshot.feed],
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
  snapshot = {
    metrics: {
      ...INITIAL_SIM_METRICS,
      ...preset,
    },
    result: null,
    feed: [],
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

  snapshot = {
    metrics: cloneMetrics(metrics),
    result: shouldResetFeed ? null : snapshot.result,
    feed: shouldResetFeed ? [] : snapshot.feed,
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
    running: false,
    simulationId: snapshot.simulationId,
  };
  emit();
}

export function pushSimulationFeedMessage(message: Omit<SimulationFeedMessage, "id">) {
  if (
    snapshot.simulationId !== null &&
    snapshot.simulationId !== message.simulationId
  ) {
    return;
  }

  const entry: SimulationFeedMessage = {
    ...message,
    id: `${message.simulationId}:${message.sender}:${message.timestampMs}:${message.text}`,
  };

  if (snapshot.feed.some((item) => item.id === entry.id)) {
    return;
  }

  snapshot = {
    ...snapshot,
    simulationId: snapshot.simulationId ?? message.simulationId,
    feed: [entry, ...snapshot.feed].slice(0, MAX_SIMULATION_FEED),
  };
  emit();
}
