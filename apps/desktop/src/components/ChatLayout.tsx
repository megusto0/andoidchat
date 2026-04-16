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
  disconnect: () => void;
  setGroup: (mode: GroupMode, selected: Set<string>) => void;
  switchChat: (chatId: string) => void;
  toggleVisualization: () => void;
}

export function ChatLayout({
  state,
  sendMessage,
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
    <>
      <Header
        userName={state.userName}
        status={state.connectionStatus}
        showVisualization={state.showVisualization}
        onToggleVisualization={toggleVisualization}
        onDisconnect={disconnect}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
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
            clients={state.clients}
            onlineClients={state.onlineClients}
            clientPlatforms={state.clientPlatforms}
            groupMode={state.groupMode}
            selectedClients={state.selectedClients}
            onSetGroup={handleSetGroup}
          />
        )}
        <div className={s.main}>
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
          <VisualizationPanel onClose={toggleVisualization} />
        )}
      </div>
    </>
  );
}
