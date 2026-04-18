/**
 * Утилиты для парсинга протокола мессенджера.
 *
 * Экранирование на стороне сервера:
 *   реальный \n → литерал \n
 *   реальный \\  → литерал \\
 */

/** Восстанавливает экранированный текст. */
export function decodeEscapedText(raw: string): string {
  const result: string[] = [];
  let escaped = false;

  for (const ch of raw) {
    if (!escaped) {
      if (ch === "\\") {
        escaped = true;
      } else {
        result.push(ch);
      }
      continue;
    }

    if (ch === "n") {
      result.push("\n");
    } else if (ch === "\\") {
      result.push("\\");
    } else {
      result.push("\\", ch);
    }

    escaped = false;
  }

  if (escaped) {
    result.push("\\");
  }

  return result.join("");
}

import type {
  ClientPlatform,
  HistoryMessage,
  ParsedPacket,
  SimMetrics,
  SimulationMode,
} from "../types";

function normalizeMode(value: unknown): "all" | "none" | "custom" {
  if (value === "all" || value === "none" || value === "custom") {
    return value;
  }
  return "custom";
}

function normalizeClientPlatform(value: unknown): ClientPlatform {
  if (value === "desktop" || value === "android") {
    return value;
  }
  return "unknown";
}

function normalizeSimulationMode(value: unknown): SimulationMode {
  if (value === "visible" || value === "benchmark") {
    return value;
  }
  if (value === "observe") {
    return "visible";
  }
  if (value === "load") {
    return "benchmark";
  }
  return "visible";
}

const EMPTY_SIM_METRICS: SimMetrics = {
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

function parseSimMetricsPayload(payload: string): SimMetrics | null {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      requestedClients:
        typeof parsed.requestedClients === "number" ? parsed.requestedClients : 0,
      mode: normalizeSimulationMode(parsed.mode),
      activeClients:
        typeof parsed.activeClients === "number" ? parsed.activeClients : 0,
      totalConnected:
        typeof parsed.totalConnected === "number" ? parsed.totalConnected : 0,
      failedConnections:
        typeof parsed.failedConnections === "number" ? parsed.failedConnections : 0,
      messagesSent:
        typeof parsed.messagesSent === "number" ? parsed.messagesSent : 0,
      messagesReceived:
        typeof parsed.messagesReceived === "number" ? parsed.messagesReceived : 0,
      watcherDeliveries:
        typeof parsed.watcherDeliveries === "number" ? parsed.watcherDeliveries : 0,
      echoConfirmed:
        typeof parsed.echoConfirmed === "number" ? parsed.echoConfirmed : 0,
      serverResponsesConfirmed:
        typeof parsed.serverResponsesConfirmed === "number"
          ? parsed.serverResponsesConfirmed
          : 0,
      incorrectResponses:
        typeof parsed.incorrectResponses === "number"
          ? parsed.incorrectResponses
          : 0,
      avgResponseMs:
        typeof parsed.avgResponseMs === "number" ? parsed.avgResponseMs : 0,
      p50ResponseMs:
        typeof parsed.p50ResponseMs === "number" ? parsed.p50ResponseMs : 0,
      p95ResponseMs:
        typeof parsed.p95ResponseMs === "number" ? parsed.p95ResponseMs : 0,
      messagesPerSecond:
        typeof parsed.messagesPerSecond === "number"
          ? parsed.messagesPerSecond
          : 0,
      elapsedSeconds:
        typeof parsed.elapsedSeconds === "number" ? parsed.elapsedSeconds : 0,
      phase: typeof parsed.phase === "string" ? parsed.phase : "idle",
      botStatuses: Array.isArray(parsed.botStatuses)
        ? parsed.botStatuses.flatMap((bot: unknown) => {
            if (!bot || typeof bot !== "object") {
              return [];
            }

            const raw = bot as Record<string, unknown>;
            if (typeof raw.name !== "string" || typeof raw.status !== "string") {
              return [];
            }

            return [
              {
                name: raw.name,
                status: raw.status,
                messagesSent:
                  typeof raw.messagesSent === "number" ? raw.messagesSent : 0,
              },
            ];
          })
        : [],
      passed: Boolean(parsed.passed),
    };
  } catch (_) {
    return null;
  }
}

/** Разбирает пакет сервера по команде и полезной нагрузке. */
export function parseServerPacket(
  command: string,
  payload: string
): ParsedPacket {
  switch (command) {
    case "LOGIN_OK":
      return { kind: "login_ok", name: payload };

    case "INFO":
      return { kind: "info", text: decodeEscapedText(payload) };

    case "ERROR":
      return { kind: "error", text: decodeEscapedText(payload) };

    case "MESSAGE": {
      try {
        const parsed = JSON.parse(payload);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.sender === "string" &&
          typeof parsed.content === "string"
        ) {
          return {
            kind: "message",
            sender: parsed.sender,
            text: parsed.content,
            mode: normalizeMode(parsed.mode),
            targets: Array.isArray(parsed.targets)
              ? parsed.targets.filter(
                  (name: unknown): name is string => typeof name === "string"
                )
              : [],
            timestampMs:
              typeof parsed.timestamp === "number"
                ? parsed.timestamp
                : Date.now(),
            simulationId:
              typeof parsed.simulationId === "string"
                ? parsed.simulationId
                : null,
            simulationMode:
              typeof parsed.simulationMode === "string"
                ? normalizeSimulationMode(parsed.simulationMode)
                : null,
          };
        }
      } catch (_) {
        /* fallback to legacy parser below */
      }

      const pipeIdx = payload.indexOf("|");
      if (pipeIdx === -1) {
        return {
          kind: "message",
          sender: "Неизвестно",
          text: decodeEscapedText(payload),
          mode: "all",
          targets: [],
          timestampMs: Date.now(),
          simulationId: null,
          simulationMode: null,
        };
      }
      return {
        kind: "message",
        sender: payload.slice(0, pipeIdx),
        text: decodeEscapedText(payload.slice(pipeIdx + 1)),
        mode: "all",
        targets: [],
        timestampMs: Date.now(),
        simulationId: null,
        simulationMode: null,
      };
    }

    case "CLIENTS":
      return {
        kind: "clients",
        names: payload.split(",").filter(Boolean),
      };

    case "CLIENTS_META": {
      try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const platforms: Record<string, ClientPlatform> = {};
          for (const [name, platform] of Object.entries(parsed)) {
            if (typeof name === "string" && name) {
              platforms[name] = normalizeClientPlatform(platform);
            }
          }
          return {
            kind: "clients_meta",
            platforms,
          };
        }
      } catch (_) {
        /* ignore malformed meta packet */
      }

      return {
        kind: "clients_meta",
        platforms: {},
      };
    }

    case "SYNC_HISTORY": {
      try {
        const parsed = JSON.parse(payload);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.messages)
        ) {
          const messages: HistoryMessage[] = parsed.messages.flatMap(
            (message: unknown) => {
              if (!message || typeof message !== "object") {
                return [];
              }

              const raw = message as Record<string, unknown>;
              if (
                typeof raw.sender !== "string" ||
                typeof raw.content !== "string"
              ) {
                return [];
              }

              return [
                {
                  sender: raw.sender,
                  text: raw.content,
                  mode: normalizeMode(raw.mode),
                  targets: Array.isArray(raw.targets)
                    ? raw.targets.filter(
                        (name: unknown): name is string =>
                          typeof name === "string"
                      )
                    : [],
                  timestampMs:
                    typeof raw.timestamp === "number"
                      ? raw.timestamp
                      : Date.now(),
                },
              ];
            }
          );

          return { kind: "sync_history", messages };
        }
      } catch (_) {
        /* ignore malformed sync payload */
      }

      return { kind: "sync_history", messages: [] };
    }

    case "SIMULATION_METRICS":
      return {
        kind: "simulation_metrics",
        metrics: parseSimMetricsPayload(payload) ?? EMPTY_SIM_METRICS,
      };

    case "SIMULATION_RESULT":
      return {
        kind: "simulation_result",
        result: parseSimMetricsPayload(payload) ?? EMPTY_SIM_METRICS,
      };

    default:
      return { kind: "info", text: `${command}|${payload}` };
  }
}
