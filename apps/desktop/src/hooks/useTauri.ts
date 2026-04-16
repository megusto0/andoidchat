/**
 * Хук для работы с Tauri API: вызов команд и polling очереди пакетов из Rust.
 */
import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatAction, ClientPlatform } from "../types";
import { parseServerPacket } from "../utils/protocol";

interface ConnectResult {
  name: string;
  clients: string[];
  clientPlatforms: Record<string, ClientPlatform>;
}

interface DiscoveryResult {
  host: string;
  port: number;
}

interface ServerPacket {
  command: string;
  payload: string;
}

export function useTauri(dispatch: React.Dispatch<ChatAction>) {
  const listPollRef = useRef<number | null>(null);
  const packetPollRef = useRef<number | null>(null);
  const connectedRef = useRef(false);

  const stopClientListPolling = useCallback(() => {
    if (listPollRef.current !== null) {
      window.clearInterval(listPollRef.current);
      listPollRef.current = null;
    }
  }, []);

  const stopPacketPolling = useCallback(() => {
    if (packetPollRef.current !== null) {
      window.clearInterval(packetPollRef.current);
      packetPollRef.current = null;
    }
  }, []);

  const requestClientList = useCallback(async () => {
    try {
      await invoke("send_command", { raw: "LIST|" });
    } catch (_) {
      /* соединение могло уже закрыться */
    }
  }, []);

  const syncClientsFromBackend = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const [clients, clientPlatforms] = await Promise.all([
        invoke<string[]>("get_clients"),
        invoke<Record<string, ClientPlatform>>("get_client_platforms"),
      ]);
      dispatch({ type: "CLIENTS_UPDATED", clients });
      dispatch({ type: "CLIENT_PLATFORMS_UPDATED", platforms: clientPlatforms });
    } catch (_) {
      /* */
    }
  }, [dispatch]);

  const startClientListPolling = useCallback(() => {
    stopClientListPolling();
    listPollRef.current = window.setInterval(() => {
      void requestClientList();
    }, 1200);
  }, [requestClientList, stopClientListPolling]);

  const drainServerPackets = useCallback(async () => {
    try {
      const packets = await invoke<ServerPacket[]>("drain_packets");

      for (const packet of packets) {
        if (packet.command === "DISCONNECTED") {
          connectedRef.current = false;
          stopClientListPolling();
          stopPacketPolling();
          dispatch({ type: "DISCONNECTED" });
          continue;
        }

        const parsed = parseServerPacket(packet.command, packet.payload);

        switch (parsed.kind) {
          case "login_ok":
            dispatch({ type: "CONNECTED", name: parsed.name });
            break;
          case "info":
            dispatch({ type: "INFO_RECEIVED", text: parsed.text });
            break;
          case "error":
            dispatch({ type: "ERROR_RECEIVED", text: parsed.text });
            break;
          case "message":
            dispatch({
              type: "MESSAGE_RECEIVED",
              sender: parsed.sender,
              text: parsed.text,
              mode: parsed.mode,
              targets: parsed.targets,
              timestampMs: parsed.timestampMs,
            });
            break;
          case "clients":
            dispatch({ type: "CLIENTS_UPDATED", clients: parsed.names });
            break;
          case "clients_meta":
            dispatch({
              type: "CLIENT_PLATFORMS_UPDATED",
              platforms: parsed.platforms,
            });
            break;
          case "sync_history":
            dispatch({ type: "HISTORY_SYNCED", messages: parsed.messages });
            break;
        }
      }
    } catch (_) {
      /* */
    }
  }, [dispatch, stopClientListPolling, stopPacketPolling]);

  const startPacketPolling = useCallback(() => {
    stopPacketPolling();
    packetPollRef.current = window.setInterval(() => {
      void drainServerPackets();
    }, 250);
  }, [drainServerPackets, stopPacketPolling]);

  useEffect(() => {
    const refreshVisibleClientList = () => {
      if (!connectedRef.current) return;
      if (document.visibilityState === "hidden") return;
      void requestClientList();
      window.setTimeout(() => {
        void syncClientsFromBackend();
        void drainServerPackets();
      }, 150);
    };

    window.addEventListener("focus", refreshVisibleClientList);
    document.addEventListener("visibilitychange", refreshVisibleClientList);

    return () => {
      connectedRef.current = false;
      stopClientListPolling();
      stopPacketPolling();
      window.removeEventListener("focus", refreshVisibleClientList);
      document.removeEventListener("visibilitychange", refreshVisibleClientList);
    };
  }, [
    drainServerPackets,
    requestClientList,
    stopClientListPolling,
    stopPacketPolling,
    syncClientsFromBackend,
  ]);

  const connect = useCallback(
    async (host: string, port: number, name: string) => {
      try {
        dispatch({ type: "CONNECT", host, port: String(port), name });
        const result = await invoke<ConnectResult>("connect", {
          host,
          port,
          name,
        });
        connectedRef.current = true;
        dispatch({ type: "CONNECTED", name: result.name });
        dispatch({ type: "CLIENTS_UPDATED", clients: result.clients });
        dispatch({
          type: "CLIENT_PLATFORMS_UPDATED",
          platforms: result.clientPlatforms,
        });
        startPacketPolling();
        startClientListPolling();
        void requestClientList();
        void drainServerPackets();
      } catch (e) {
        connectedRef.current = false;
        stopClientListPolling();
        stopPacketPolling();
        dispatch({
          type: "SET_ERROR",
          error: typeof e === "string" ? e : String(e),
        });
      }
    },
    [
      dispatch,
      drainServerPackets,
      requestClientList,
      startClientListPolling,
      startPacketPolling,
      stopClientListPolling,
      stopPacketPolling,
    ]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      mode: "all" | "none" | "custom",
      targets: string[]
    ) => {
      try {
        await invoke("send_message", { text, mode, targets });
        dispatch({ type: "SEND_MESSAGE", text, mode, targets });
      } catch (e) {
        dispatch({
          type: "ERROR_RECEIVED",
          text: typeof e === "string" ? e : String(e),
        });
      }
    },
    [dispatch]
  );

  const sendCommand = useCallback(async (raw: string) => {
    try {
      await invoke("send_command", { raw });
    } catch (_) {
      /* ошибка обработана через event */
    }
  }, []);

  const discoverServer = useCallback(async () => {
    try {
      return await invoke<DiscoveryResult | null>("discover_server", {
        timeoutMs: 1500,
      });
    } catch (_) {
      return null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    connectedRef.current = false;
    stopClientListPolling();
    stopPacketPolling();
    try {
      await invoke("send_command", { raw: "QUIT|" });
    } catch (_) {
      /* сервер мог уже закрыть соединение */
    }
    try {
      await invoke("disconnect");
    } catch (_) {
      /* */
    }
    dispatch({ type: "DISCONNECTED" });
  }, [dispatch, stopClientListPolling, stopPacketPolling]);

  return { connect, sendMessage, sendCommand, disconnect, discoverServer };
}
