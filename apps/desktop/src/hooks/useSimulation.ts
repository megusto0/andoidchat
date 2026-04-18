import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { SimulationFeedMessage, SimulationMode } from "../types";
import {
  getSimulationSnapshot,
  resetSimulationState,
  subscribeSimulation,
} from "../utils/simulationBus";

interface UseSimulationResult {
  metrics: ReturnType<typeof getSimulationSnapshot>["metrics"];
  result: ReturnType<typeof getSimulationSnapshot>["result"];
  feed: SimulationFeedMessage[];
  running: boolean;
  mode: SimulationMode;
  setMode: Dispatch<SetStateAction<SimulationMode>>;
  start: (count: number) => Promise<void>;
  stop: () => Promise<void>;
  isDone: boolean;
  passed: boolean;
}

export function useSimulation(
  sendCommand: (raw: string) => Promise<void> | void
): UseSimulationResult {
  const [snapshot, setSnapshot] = useState(() => getSimulationSnapshot());
  const [mode, setMode] = useState<SimulationMode>(
    getSimulationSnapshot().metrics.mode
  );

  useEffect(() => {
    setSnapshot(getSimulationSnapshot());
    return subscribeSimulation(() => {
      setSnapshot(getSimulationSnapshot());
    });
  }, []);

  useEffect(() => {
    if (snapshot.running) {
      setMode(snapshot.metrics.mode);
    }
  }, [snapshot.metrics.mode, snapshot.running]);

  const start = useCallback(
    async (count: number) => {
      resetSimulationState({
        mode,
        requestedClients: count,
      });

      await sendCommand(
        `SIMULATE|${JSON.stringify({
          mode,
          count,
        })}`
      );
    },
    [mode, sendCommand]
  );

  const stop = useCallback(async () => {
    await sendCommand("SIMULATE|stop");
  }, [sendCommand]);

  const phase = snapshot.result?.phase ?? snapshot.metrics.phase;
  const isDone = phase === "done" || phase === "cancelled";
  const passed = snapshot.result?.passed ?? snapshot.metrics.passed;

  return {
    metrics: snapshot.metrics,
    result: snapshot.result,
    feed: snapshot.feed,
    running: snapshot.running,
    mode,
    setMode,
    start,
    stop,
    isDone,
    passed,
  };
}
