/**
 * Хук для управления симуляцией нагрузочного тестирования.
 *
 * Подписывается на событие simulation-metrics и предоставляет
 * методы для запуска/остановки симуляции.
 */
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface BotStatus {
  name: string;
  status: string;
  messagesSent: number;
}

export interface SimMetrics {
  activeClients: number;
  totalConnected: number;
  failedConnections: number;
  messagesSent: number;
  messagesReceived: number;
  incorrectResponses: number;
  avgResponseMs: number;
  messagesPerSecond: number;
  elapsedSeconds: number;
  phase: string;
  botStatuses: BotStatus[];
}

const INITIAL_METRICS: SimMetrics = {
  activeClients: 0,
  totalConnected: 0,
  failedConnections: 0,
  messagesSent: 0,
  messagesReceived: 0,
  incorrectResponses: 0,
  avgResponseMs: 0,
  messagesPerSecond: 0,
  elapsedSeconds: 0,
  phase: "idle",
  botStatuses: [],
};

export function useSimulation() {
  const [metrics, setMetrics] = useState<SimMetrics>(INITIAL_METRICS);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const unlisten = listen<SimMetrics>("simulation-metrics", (event) => {
      setMetrics(event.payload);
      setRunning(event.payload.phase !== "done" && event.payload.phase !== "idle");
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const start = useCallback(
    async (host: string, port: number, count: number) => {
      setRunning(true);
      setMetrics({ ...INITIAL_METRICS, phase: "connecting" });
      try {
        await invoke("start_simulation", { host, port, count });
      } catch (e) {
        setRunning(false);
        setMetrics((m) => ({ ...m, phase: "done" }));
      }
    },
    []
  );

  const stop = useCallback(async () => {
    try {
      await invoke("stop_simulation");
    } catch (_) {
      /* */
    }
    setRunning(false);
  }, []);

  const isDone = metrics.phase === "done";
  const passed =
    isDone &&
    metrics.totalConnected >= 50 &&
    metrics.incorrectResponses === 0;

  return { metrics, running, start, stop, isDone, passed };
}
