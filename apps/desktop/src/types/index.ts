/** Тип сообщения в чате. */
export type MessageType = "own" | "other" | "info" | "error";

/** Одно сообщение. */
export interface Message {
  id: string;
  type: MessageType;
  sender: string;
  text: string;
  timestamp: Date;
}

export interface HistoryMessage {
  sender: string;
  text: string;
  mode: GroupMode;
  targets: string[];
  timestampMs: number;
}

/** Контекст чата. */
export type ChatContextKind = "general" | "self" | "group";

/** Один сохранённый чат-контекст. */
export interface ChatContext {
  id: string;
  kind: ChatContextKind;
  title: string;
  participants: string[];
  messages: Message[];
  hasUnread: boolean;
  lastActivityAt: number;
}

/** Отложенное собственное сообщение для дедупликации server echo. */
export interface PendingOwnMessage {
  chatId: string;
  text: string;
}

/** Режим группы. */
export type GroupMode = "all" | "none" | "custom";

/** Платформа клиента. */
export type ClientPlatform = "desktop" | "android" | "unknown";

/** Статус подключения. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

/** Экран приложения. */
export type Screen = "login" | "chat";

/** Глобальное состояние чата. */
export interface ChatState {
  screen: Screen;
  connectionStatus: ConnectionStatus;
  userName: string;
  host: string;
  port: string;
  connectedAtMs: number | null;
  chats: Record<string, ChatContext>;
  chatOrder: string[];
  activeChatId: string | null;
  clients: string[];
  onlineClients: Set<string>;
  clientPlatforms: Record<string, ClientPlatform>;
  pendingOwnMessages: PendingOwnMessage[];
  groupMode: GroupMode;
  selectedClients: Set<string>;
  error: string | null;
  showVisualization: boolean;
}

/** Действия редюсера. */
export type ChatAction =
  | { type: "CONNECT"; host: string; port: string; name: string }
  | { type: "CONNECTED"; name: string }
  | { type: "DISCONNECTED" }
  | {
      type: "MESSAGE_RECEIVED";
      sender: string;
      text: string;
      mode: GroupMode;
      targets: string[];
      timestampMs: number;
    }
  | { type: "HISTORY_SYNCED"; messages: HistoryMessage[] }
  | { type: "CLIENTS_UPDATED"; clients: string[] }
  | { type: "CLIENT_PLATFORMS_UPDATED"; platforms: Record<string, ClientPlatform> }
  | { type: "INFO_RECEIVED"; text: string }
  | { type: "ERROR_RECEIVED"; text: string }
  | {
      type: "SEND_MESSAGE";
      text: string;
      mode: GroupMode;
      targets: string[];
    }
  | { type: "SET_GROUP"; mode: GroupMode; selected: Set<string> }
  | { type: "SWITCH_CHAT"; chatId: string }
  | { type: "TOGGLE_VISUALIZATION" }
  | { type: "SET_ERROR"; error: string };

/** Распарсенный пакет сервера. */
export type ParsedPacket =
  | { kind: "login_ok"; name: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string }
  | { kind: "message"; sender: string; text: string; mode: GroupMode; targets: string[]; timestampMs: number }
  | { kind: "sync_history"; messages: HistoryMessage[] }
  | { kind: "clients"; names: string[] }
  | { kind: "clients_meta"; platforms: Record<string, ClientPlatform> }
;
