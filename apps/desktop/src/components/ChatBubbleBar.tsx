import type { ChatContext } from "../types";
import s from "./ChatBubbleBar.module.css";

interface Props {
  chats: ChatContext[];
  activeChatId: string | null;
  onSwitchChat: (chatId: string) => void;
}

export function ChatBubbleBar({ chats, activeChatId, onSwitchChat }: Props) {
  if (chats.length === 0) {
    return null;
  }

  return (
    <div className={s.wrap}>
      <div className={s.grid}>
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <button
              key={chat.id}
              type="button"
              className={`${s.bubble} ${isActive ? s.bubbleActive : ""}`}
              onClick={() => onSwitchChat(chat.id)}
              aria-pressed={isActive}
              title={chat.title}
            >
              <span className={s.label}>{chat.title}</span>
              {chat.hasUnread && <span className={s.unreadDot} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
