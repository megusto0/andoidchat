import { useCallback } from "react";
import { useTauri } from "./hooks/useTauri";
import { useChatReducer } from "./hooks/useChatReducer";
import { LoginScreen } from "./components/LoginScreen";
import { ChatLayout } from "./components/ChatLayout";
import type { GroupMode } from "./types";

import "./styles/global.css";

export default function App() {
  const [state, dispatch] = useChatReducer();
  const { connect, sendMessage, disconnect, discoverServer } = useTauri(dispatch);

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

  if (state.screen === "login") {
    return (
      <LoginScreen
        onConnect={connect}
        onDiscoverServer={discoverServer}
        status={state.connectionStatus}
        error={state.error}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ChatLayout
        state={state}
        sendMessage={handleSendMessage}
        disconnect={disconnect}
        setGroup={handleSetGroup}
        switchChat={handleSwitchChat}
        toggleVisualization={handleToggleVisualization}
      />
    </div>
  );
}
