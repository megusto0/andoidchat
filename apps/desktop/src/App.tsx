import { useCallback } from "react";
import { useTauri } from "./hooks/useTauri";
import { useChatReducer } from "./hooks/useChatReducer";
import { LoginScreen } from "./components/LoginScreen";
import { ChatLayout } from "./components/ChatLayout";
import { WindowTitlebar } from "./components/WindowTitlebar";
import type { GroupMode } from "./types";

import "./styles/global.css";

export default function App() {
  const [state, dispatch] = useChatReducer();
  const { connect, sendMessage, sendCommand, disconnect, discoverServer } =
    useTauri(dispatch);

  const handleSendMessage = useCallback(
    (text: string, mode: GroupMode, targets: string[]) => {
      sendMessage(text, mode, targets);
    },
    [sendMessage]
  );

  const handleSetGroup = useCallback(
    (mode: GroupMode, selected: Set<string>) => {
      dispatch({ type: "SET_GROUP", mode, selected });
    },
    [dispatch]
  );

  const handleSwitchChat = useCallback(
    (chatId: string) => {
      dispatch({ type: "SWITCH_CHAT", chatId });
    },
    [dispatch]
  );

  const handleToggleVisualization = useCallback(() => {
    dispatch({ type: "TOGGLE_VISUALIZATION" });
  }, [dispatch]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <WindowTitlebar
        meta={state.screen === "chat" ? `${state.host}:${state.port}` : undefined}
      />
      {state.screen === "login" ? (
        <LoginScreen
          onConnect={connect}
          onDiscoverServer={discoverServer}
          status={state.connectionStatus}
          error={state.error}
        />
      ) : (
        <ChatLayout
          state={state}
          sendMessage={handleSendMessage}
          disconnect={disconnect}
          setGroup={handleSetGroup}
          switchChat={handleSwitchChat}
          toggleVisualization={handleToggleVisualization}
          sendCommand={sendCommand}
        />
      )}
    </div>
  );
}
