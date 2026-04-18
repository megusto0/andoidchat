/**
 * Редюсер состояния чата.
 */
import { useReducer } from "react";
import type {
  ChatAction,
  ChatContext,
  ChatContextKind,
  ChatState,
  HistoryMessage,
  Message,
  PendingOwnMessage,
} from "../types";

const GENERAL_CHAT_ID = "chat:general";
const SELF_CHAT_ID = "chat:self";

const initialState: ChatState = {
  screen: "login",
  connectionStatus: "disconnected",
  userName: "",
  host: "",
  port: "",
  connectedAtMs: null,
  chats: {},
  chatOrder: [],
  activeChatId: null,
  clients: [],
  onlineClients: new Set(),
  clientPlatforms: {},
  pendingOwnMessages: [],
  groupMode: "all",
  selectedClients: new Set(),
  error: null,
  showVisualization: false,
};

function makeMessage(
  type: Message["type"],
  sender: string,
  text: string,
  timestampMs = Date.now()
): Message {
  return {
    id: crypto.randomUUID(),
    type,
    sender,
    text,
    timestamp: new Date(timestampMs),
  };
}

function sortNames(names: Iterable<string>): string[] {
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "ru"));
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function platformMapsEqual(
  a: Record<string, ChatState["clientPlatforms"][string]>,
  b: Record<string, ChatState["clientPlatforms"][string]>
): boolean {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) return false;
  for (const [name, platform] of aEntries) {
    if (b[name] !== platform) return false;
  }
  return true;
}

function makeChatTitle(kind: ChatContextKind, participants: string[]): string {
  if (kind === "general") return "General";
  if (kind === "self") return "Self";

  if (participants.length <= 2) {
    return participants.join(", ");
  }

  return `${participants[0]}, ${participants[1]} + ${participants.length - 2}`;
}

function makeChatDescriptor(
  kind: ChatContextKind,
  rawParticipants: Iterable<string>
) {
  const participants = sortNames(rawParticipants);

  if (kind === "general") {
    return {
      id: GENERAL_CHAT_ID,
      kind,
      participants: [] as string[],
      title: makeChatTitle(kind, []),
    };
  }

  if (kind === "self") {
    return {
      id: SELF_CHAT_ID,
      kind,
      participants: [] as string[],
      title: makeChatTitle(kind, []),
    };
  }

  return {
    id: `chat:group:${participants.join("|")}`,
    kind,
    participants,
    title: makeChatTitle(kind, participants),
  };
}

function getDescriptorFromOutgoing(mode: ChatState["groupMode"], targets: string[]) {
  if (mode === "all") {
    return makeChatDescriptor("general", []);
  }

  if (mode === "none" || targets.length === 0) {
    return makeChatDescriptor("self", []);
  }

  return makeChatDescriptor("group", targets);
}

function getDescriptorFromIncoming(
  currentUser: string,
  sender: string,
  mode: ChatState["groupMode"],
  targets: string[]
) {
  if (mode === "all") {
    return makeChatDescriptor("general", []);
  }

  if (mode === "none") {
    return makeChatDescriptor("self", []);
  }

  const participants = new Set(
    [sender, ...targets].filter((name) => name !== currentUser)
  );

  if (participants.size === 0) {
    return makeChatDescriptor("self", []);
  }

  return makeChatDescriptor("group", participants);
}

function ensureChat(
  chats: Record<string, ChatContext>,
  descriptor: ReturnType<typeof makeChatDescriptor>
) {
  const existing = chats[descriptor.id];
  if (existing) {
    return {
      ...existing,
      kind: descriptor.kind,
      participants: descriptor.participants,
      title: descriptor.title,
    };
  }

  return {
    id: descriptor.id,
    kind: descriptor.kind,
    title: descriptor.title,
    participants: descriptor.participants,
    messages: [],
    hasUnread: false,
    lastActivityAt: Date.now(),
  } satisfies ChatContext;
}

function sortChatOrder(chats: Record<string, ChatContext>): string[] {
  return Object.values(chats)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .map((chat) => chat.id);
}

function getReferencedRecipients(state: ChatState): Set<string> {
  const referenced = new Set<string>();

  for (const chat of Object.values(state.chats)) {
    if (chat.kind !== "group") continue;
    for (const participant of chat.participants) {
      if (participant !== state.userName) {
        referenced.add(participant);
      }
    }
  }

  for (const name of state.selectedClients) {
    if (name !== state.userName) {
      referenced.add(name);
    }
  }

  return referenced;
}

function appendMessageToChat(
  state: ChatState,
  descriptor: ReturnType<typeof makeChatDescriptor>,
  message: Message,
  options?: {
    activate?: boolean;
    markUnread?: boolean;
  }
) {
  const current = ensureChat(state.chats, descriptor);
  const activate = options?.activate ?? false;
  const shouldMarkUnread = options?.markUnread ?? false;
  const updatedMessages = mergeMessages(current.messages, [message]);
  const timestampMs =
    updatedMessages[updatedMessages.length - 1]?.timestamp.getTime() ??
    message.timestamp.getTime();

  const updatedChat: ChatContext = {
    ...current,
    messages: updatedMessages,
    hasUnread: activate ? false : current.hasUnread || shouldMarkUnread,
    lastActivityAt: Math.max(current.lastActivityAt, timestampMs),
  };

  const chats = {
    ...state.chats,
    [descriptor.id]: updatedChat,
  };

  return {
    chats,
    chatOrder: sortChatOrder(chats),
    activeChatId: activate ? descriptor.id : state.activeChatId,
  };
}

function messageDedupKey(message: Message): string {
  return `${message.sender}|${message.timestamp.getTime()}|${message.text}`;
}

function mergeMessages(existing: Message[], additions: Message[]): Message[] {
  if (additions.length === 0) return existing;
  if (existing.length === 0) return additions;

  const seen = new Set(existing.map(messageDedupKey));
  const deduped = additions.filter((message) => {
    const key = messageDedupKey(message);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) {
    return existing;
  }

  if (
    existing[existing.length - 1]!.timestamp.getTime() <=
    deduped[0]!.timestamp.getTime()
  ) {
    return [...existing, ...deduped];
  }

  return [...existing, ...deduped].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
}

function upsertChat(
  state: ChatState,
  descriptor: ReturnType<typeof makeChatDescriptor>,
  options?: {
    activate?: boolean;
    clearUnread?: boolean;
  }
) {
  const current = ensureChat(state.chats, descriptor);
  const updatedChat: ChatContext = {
    ...current,
    hasUnread: options?.clearUnread ? false : current.hasUnread,
  };

  const chats = {
    ...state.chats,
    [descriptor.id]: updatedChat,
  };

  return {
    chats,
    chatOrder: sortChatOrder(chats),
    activeChatId: options?.activate ? descriptor.id : state.activeChatId,
  };
}

function getSelectedClientsForChat(
  state: ChatState,
  chat: ChatContext
): Set<string> {
  const visibleRecipients = new Set(
    state.clients.filter((name) => name !== state.userName)
  );

  if (chat.kind === "general") {
    return new Set(
      Array.from(state.onlineClients).filter((name) => name !== state.userName)
    );
  }

  if (chat.kind === "self") {
    return new Set();
  }

  return new Set(
    chat.participants.filter((name) => visibleRecipients.has(name))
  );
}

function getGroupModeForChat(chat: ChatContext): ChatState["groupMode"] {
  if (chat.kind === "general") return "all";
  if (chat.kind === "self") return "none";
  return "custom";
}

function reduceHistory(state: ChatState, messages: HistoryMessage[]): ChatState {
  if (messages.length === 0) {
    return state;
  }

  const grouped = new Map<
    string,
    {
      descriptor: ReturnType<typeof makeChatDescriptor>;
      messages: Message[];
    }
  >();

  for (const historyMessage of [...messages].sort(
    (a, b) => a.timestampMs - b.timestampMs
  )) {
    const descriptor = getDescriptorFromIncoming(
      state.userName,
      historyMessage.sender,
      historyMessage.mode,
      historyMessage.targets
    );
    const message = makeMessage(
      historyMessage.sender === state.userName ? "own" : "other",
      historyMessage.sender,
      historyMessage.text,
      historyMessage.timestampMs
    );

    const existing = grouped.get(descriptor.id);
    if (existing) {
      existing.messages.push(message);
    } else {
      grouped.set(descriptor.id, {
        descriptor,
        messages: [message],
      });
    }
  }

  if (grouped.size === 0) {
    return state;
  }

  const chats: Record<string, ChatContext> = { ...state.chats };

  for (const { descriptor, messages: additions } of grouped.values()) {
    const current = ensureChat(chats, descriptor);
    const mergedMessages = mergeMessages(current.messages, additions);
    chats[descriptor.id] = {
      ...current,
      messages: mergedMessages,
      lastActivityAt: Math.max(
        current.lastActivityAt,
        mergedMessages[mergedMessages.length - 1]?.timestamp.getTime() ??
          current.lastActivityAt
      ),
    };
  }

  return {
    ...state,
    chats,
    chatOrder: sortChatOrder(chats),
  };
}

function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "CONNECT":
      return {
        ...state,
        connectionStatus: "connecting",
        error: null,
        userName: action.name,
        host: action.host,
        port: action.port,
      };

    case "CONNECTED": {
      const generalDescriptor = makeChatDescriptor("general", []);
      const connectionMessage = makeMessage(
        "info",
        "Сервер",
        "Подключение установлено"
      );
      const baseState: ChatState = {
        ...state,
        screen: "chat",
        connectionStatus: "connected",
        userName: action.name,
        connectedAtMs: state.connectedAtMs ?? Date.now(),
        error: null,
        chats: {},
        chatOrder: [],
        activeChatId: GENERAL_CHAT_ID,
        clients: [action.name],
        onlineClients: new Set([action.name]),
        clientPlatforms: {
          [action.name]: "desktop",
        },
        pendingOwnMessages: [],
        groupMode: "all",
        selectedClients: new Set(),
      };
      const chatUpdate = appendMessageToChat(
        baseState,
        generalDescriptor,
        connectionMessage,
        { activate: true }
      );

      return {
        ...baseState,
        chats: chatUpdate.chats,
        chatOrder: chatUpdate.chatOrder,
        activeChatId: GENERAL_CHAT_ID,
      };
    }

    case "DISCONNECTED":
      return {
        ...initialState,
      };

    case "MESSAGE_RECEIVED": {
      const descriptor = getDescriptorFromIncoming(
        state.userName,
        action.sender,
        action.mode,
        action.targets
      );

      if (action.sender === state.userName) {
        const pendingIndex = state.pendingOwnMessages.findIndex(
          (pending) =>
            pending.chatId === descriptor.id && pending.text === action.text
        );

        if (pendingIndex !== -1) {
          return {
            ...state,
            pendingOwnMessages: state.pendingOwnMessages.filter(
              (_, index) => index !== pendingIndex
            ),
          };
        }
      }

      const message = makeMessage(
        action.sender === state.userName ? "own" : "other",
        action.sender,
        action.text,
        action.timestampMs
      );
      const isActive = state.activeChatId === descriptor.id;
      const chatUpdate = appendMessageToChat(state, descriptor, message, {
        markUnread: !isActive,
      });

      return {
        ...state,
        chats: chatUpdate.chats,
        chatOrder: chatUpdate.chatOrder,
      };
    }

    case "HISTORY_SYNCED":
      return reduceHistory(state, action.messages);

    case "CLIENTS_UPDATED": {
      const uniqueOnlineClients = Array.from(new Set(action.clients));
      const otherOnlineClients = uniqueOnlineClients.filter(
        (name) => name !== state.userName
      );
      const preservedRecipients = Array.from(getReferencedRecipients(state)).filter(
        (name) => name !== state.userName && !otherOnlineClients.includes(name)
      );
      const visibleRecipients = sortNames([
        ...otherOnlineClients,
        ...preservedRecipients,
      ]);
      const nextClients = state.userName
        ? [state.userName, ...visibleRecipients]
        : visibleRecipients;
      const nextClientSet = new Set(nextClients);
      const previousOnlineClients = state.onlineClients;
      const nextOnlineClients = new Set([
        ...uniqueOnlineClients,
        ...(state.userName ? [state.userName] : []),
      ]);
      const joined = otherOnlineClients.filter(
        (name) => !previousOnlineClients.has(name)
      );
      const left = Array.from(previousOnlineClients).filter(
        (name) => name !== state.userName && !nextOnlineClients.has(name)
      );

      let nextState: ChatState = {
        ...state,
        clients: nextClients,
        onlineClients: nextOnlineClients,
        clientPlatforms: Object.fromEntries(
          Object.entries(state.clientPlatforms).filter(([name]) =>
            nextClientSet.has(name)
          )
        ),
      };

      for (const name of joined) {
        const descriptor = makeChatDescriptor("general", []);
        const chatUpdate = appendMessageToChat(
          nextState,
          descriptor,
          makeMessage("info", "Сервер", `${name} присоединился`),
          { markUnread: nextState.activeChatId !== descriptor.id }
        );
        nextState = {
          ...nextState,
          chats: chatUpdate.chats,
          chatOrder: chatUpdate.chatOrder,
        };
      }

      for (const name of left) {
        const descriptor = makeChatDescriptor("general", []);
        const chatUpdate = appendMessageToChat(
          nextState,
          descriptor,
          makeMessage("info", "Сервер", `${name} отключился`),
          { markUnread: nextState.activeChatId !== descriptor.id }
        );
        nextState = {
          ...nextState,
          chats: chatUpdate.chats,
          chatOrder: chatUpdate.chatOrder,
        };
      }

      let selectedClients: Set<string>;

      if (nextState.groupMode === "all") {
        selectedClients = new Set(
          Array.from(nextState.onlineClients).filter(
            (name) => name !== nextState.userName
          )
        );
      } else if (nextState.groupMode === "none") {
        selectedClients = new Set();
      } else {
        selectedClients = new Set(
          Array.from(nextState.selectedClients).filter(
            (name) => nextClientSet.has(name) && name !== nextState.userName
          )
        );
      }

      const nextPlatforms = {
        ...nextState.clientPlatforms,
        ...(nextState.userName
          ? { [nextState.userName]: "desktop" as const }
          : {}),
      };

      if (
        joined.length === 0 &&
        left.length === 0 &&
        arraysEqual(state.clients, nextClients) &&
        setsEqual(state.onlineClients, nextOnlineClients) &&
        setsEqual(state.selectedClients, selectedClients) &&
        platformMapsEqual(state.clientPlatforms, nextPlatforms)
      ) {
        return state;
      }

      return {
        ...nextState,
        clientPlatforms: nextPlatforms,
        selectedClients,
      };
    }

    case "CLIENT_PLATFORMS_UPDATED": {
      const visibleClients = new Set(
        state.userName ? [state.userName, ...state.clients] : state.clients
      );
      const nextPlatforms = { ...state.clientPlatforms };

      for (const [name, platform] of Object.entries(action.platforms)) {
        if (visibleClients.has(name)) {
          nextPlatforms[name] = platform;
        }
      }

      if (state.userName && !nextPlatforms[state.userName]) {
        nextPlatforms[state.userName] = "desktop";
      }

      if (platformMapsEqual(state.clientPlatforms, nextPlatforms)) {
        return state;
      }

      return {
        ...state,
        clientPlatforms: nextPlatforms,
      };
    }

    case "INFO_RECEIVED": {
      const descriptor = makeChatDescriptor("general", []);
      const chatUpdate = appendMessageToChat(
        state,
        descriptor,
        makeMessage("info", "Сервер", action.text),
        { markUnread: state.activeChatId !== descriptor.id }
      );
      return {
        ...state,
        chats: chatUpdate.chats,
        chatOrder: chatUpdate.chatOrder,
      };
    }

    case "ERROR_RECEIVED":
      if (state.screen === "login") {
        return {
          ...state,
          connectionStatus: "disconnected",
          error: action.text,
        };
      }

      if (state.activeChatId && state.chats[state.activeChatId]) {
        const activeChat = state.chats[state.activeChatId];
        const descriptor = makeChatDescriptor(
          activeChat.kind,
          activeChat.participants
        );
        const chatUpdate = appendMessageToChat(
          state,
          descriptor,
          makeMessage("error", "Ошибка", action.text),
          { activate: true }
        );
        return {
          ...state,
          chats: chatUpdate.chats,
          chatOrder: chatUpdate.chatOrder,
        };
      }

      return {
        ...state,
        error: action.text,
      };

    case "SEND_MESSAGE": {
      const descriptor = getDescriptorFromOutgoing(action.mode, action.targets);
      const chatUpdate = appendMessageToChat(
        state,
        descriptor,
        makeMessage("own", state.userName, action.text),
        { activate: true }
      );

      return {
        ...state,
        chats: chatUpdate.chats,
        chatOrder: chatUpdate.chatOrder,
        activeChatId: descriptor.id,
        pendingOwnMessages: [
          ...state.pendingOwnMessages,
          { chatId: descriptor.id, text: action.text } satisfies PendingOwnMessage,
        ],
        groupMode: action.mode,
        selectedClients:
          action.mode === "all"
            ? new Set(
                Array.from(state.onlineClients).filter(
                  (name) => name !== state.userName
                )
              )
            : new Set(action.targets),
      };
    }

    case "SET_GROUP": {
      if (
        state.groupMode === action.mode &&
        setsEqual(state.selectedClients, action.selected)
      ) {
        return state;
      }

      return {
        ...state,
        groupMode: action.mode,
        selectedClients: action.selected,
      };
    }

    case "SWITCH_CHAT": {
      const chat = state.chats[action.chatId];
      if (!chat) {
        return state;
      }

      const chatUpdate = upsertChat(
        state,
        makeChatDescriptor(chat.kind, chat.participants),
        {
          activate: true,
          clearUnread: true,
        }
      );

      return {
        ...state,
        chats: chatUpdate.chats,
        chatOrder: chatUpdate.chatOrder,
        activeChatId: action.chatId,
        groupMode: getGroupModeForChat(chat),
        selectedClients: getSelectedClientsForChat(state, chat),
      };
    }

    case "TOGGLE_VISUALIZATION":
      return {
        ...state,
        showVisualization: !state.showVisualization,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        connectionStatus: "disconnected",
      };

    default:
      return state;
  }
}

export function useChatReducer() {
  return useReducer(reducer, initialState);
}
