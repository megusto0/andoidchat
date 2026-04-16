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

import type { ClientPlatform, HistoryMessage, ParsedPacket } from "../types";

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
        };
      }
      return {
        kind: "message",
        sender: payload.slice(0, pipeIdx),
        text: decodeEscapedText(payload.slice(pipeIdx + 1)),
        mode: "all",
        targets: [],
        timestampMs: Date.now(),
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

    default:
      return { kind: "info", text: `${command}|${payload}` };
  }
}
