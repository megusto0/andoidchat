import { useState } from "react";
import type { ChatContext, ChatState, GroupMode } from "../types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { InputBar } from "./InputBar";
import { VisualizationPanel } from "./VisualizationPanel";
import s from "./ChatLayout.module.css";

interface Props {
  state: ChatState;
  sendMessage: (text: string, mode: GroupMode, targets: string[]) => void;
  sendCommand: (raw: string) => Promise<void> | void;
  disconnect: () => void;
  setGroup: (mode: GroupMode, selected: Set<string>) => void;
  switchChat: (chatId: string) => void;
  toggleVisualization: () => void;
}

export function ChatLayout({
  state,
  sendMessage,
  sendCommand,
  disconnect,
  setGroup,
  switchChat,
  toggleVisualization,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function getSortedRecipients(names: Iterable<string>) {
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function getCurrentTargets() {
    const otherClients = Array.from(state.onlineClients).filter(
      (name) => name !== state.userName
    );

    if (state.groupMode === "all") {
      return getSortedRecipients(otherClients);
    }

    if (state.groupMode === "none") {
      return [];
    }

    return getSortedRecipients(state.selectedClients);
  }

  function handleSetGroup(mode: GroupMode, selected: Set<string>) {
    if (
      state.groupMode === mode &&
      state.selectedClients.size === selected.size &&
      Array.from(state.selectedClients).every((name) => selected.has(name))
    ) {
      return;
    }

    setGroup(mode, selected);
  }

  function switchChatContext(chatId: string) {
    if (state.activeChatId === chatId) {
      return;
    }

    switchChat(chatId);
  }

  const visibleChats = state.chatOrder
    .slice(0, 10)
    .map((chatId) => state.chats[chatId])
    .filter((chat): chat is ChatContext => Boolean(chat));
  const activeChat =
    (state.activeChatId ? state.chats[state.activeChatId] : null) ??
    visibleChats[0] ??
    null;
  const currentTargets = getCurrentTargets();
  const canSendToCurrentTarget =
    state.groupMode !== "custom" || currentTargets.length > 0;

  return (
    <div className={s.layout}>
      {sidebarOpen && (
        <div
          className={s.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <Sidebar
          userName={state.userName}
          host={state.host}
          port={state.port}
          status={state.connectionStatus}
          clients={state.clients}
          onlineClients={state.onlineClients}
          clientPlatforms={state.clientPlatforms}
          groupMode={state.groupMode}
          selectedClients={state.selectedClients}
          onSetGroup={handleSetGroup}
        />
      )}
      <div className={s.main}>
        <div className={s.chatHeader}>
          <div className={s.chatHeaderLead}>
            <button
              className={s.menuBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Меню"
              title="Боковая панель"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            </button>
            <div className={s.chatHeaderInfo}>
              <div className={s.chatHeaderTitle}>
                <span className={s.chatHeaderName}>
                  {activeChat?.title ?? "Чат"}
                </span>
                {activeChat?.kind === "group" && (
                  <span className={s.chatHeaderBadge}>
                    GROUP · {activeChat.participants.length}
                  </span>
                )}
              </div>
              <div className={s.chatHeaderScope}>
                {activeChat?.kind === "general" && "Общий поток сообщений"}
                {activeChat?.kind === "self" && "Локальный контекст"}
                {activeChat?.kind === "group" && "Маршрут выбранных адресатов"}
              </div>
            </div>
          </div>
          <Header
            className={s.chatHeaderActions}
            showVisualization={state.showVisualization}
            onToggleVisualization={toggleVisualization}
            onDisconnect={disconnect}
          />
        </div>
        <ChatArea messages={activeChat?.messages ?? []} ownName={state.userName} />
        <InputBar
          onSend={(text) => sendMessage(text, state.groupMode, currentTargets)}
          disabled={state.connectionStatus !== "connected"}
          canSend={canSendToCurrentTarget}
          chats={visibleChats}
          activeChat={activeChat}
          activeChatId={activeChat?.id ?? null}
          groupMode={state.groupMode}
          selectedClients={state.selectedClients}
          onSwitchChat={switchChatContext}
        />
      </div>
      {state.showVisualization && (
        <VisualizationPanel
          onClose={toggleVisualization}
          sendCommand={sendCommand}
          onDisconnect={disconnect}
        />
      )}
    </div>
  );
}
