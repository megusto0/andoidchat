import { useState, useRef, type KeyboardEvent } from "react";
import type { ChatContext, ChatContextKind, GroupMode } from "../types";
import s from "./InputBar.module.css";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  canSend?: boolean;
  chats: ChatContext[];
  activeChat: ChatContext | null;
  activeChatId: string | null;
  groupMode: GroupMode;
  selectedClients: Set<string>;
  onSwitchChat: (chatId: string) => void;
}

export function InputBar({
  onSend,
  disabled,
  canSend = true,
  chats,
  activeChat,
  activeChatId,
  groupMode,
  selectedClients,
  onSwitchChat,
}: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled || !canSend) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasText = text.trim().length > 0;
  const sendDisabled = !hasText || disabled || !canSend;

  const placeholderText = !canSend
    ? "Выберите адресатов..."
    : activeChat?.kind === "general"
      ? "Сообщение в General..."
      : groupMode === "custom" && selectedClients.size > 0
        ? `Сообщение для: ${Array.from(selectedClients).sort().join(", ")}...`
        : "Введите сообщение...";

  return (
    <div className={s.bar}>
      <div className={s.statusBar}>
        {chats.length === 0 ? (
          <span className={s.statusLabel}>Current chat</span>
        ) : (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                className={`${s.statusBubble} ${
                  isActive ? s.statusBubbleActive : ""
                }`}
                onClick={() => onSwitchChat(chat.id)}
                aria-pressed={isActive}
                title={chat.title}
              >
                <span className={s.statusBubbleLabel}>{chat.title}</span>
                {chat.hasUnread && (
                  <span className={s.statusBubbleUnread} aria-hidden="true" />
                )}
              </button>
            );
          })
        )}
      </div>
      <div className={s.inputWrap}>
        <textarea
          ref={textareaRef}
          className={s.textarea}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          rows={1}
          disabled={disabled || !canSend}
          aria-label="Поле ввода сообщения"
        />
        <button
          className={`${s.sendBtn} ${hasText ? s.sendBtnVisible : ""}`}
          onClick={handleSend}
          disabled={sendDisabled}
          aria-label="Отправить"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5,12 12,5 19,12" />
          </svg>
        </button>
      </div>
      <div className={s.hint}>
        Enter — отправить, Shift+Enter — новая строка
      </div>
    </div>
  );
}
