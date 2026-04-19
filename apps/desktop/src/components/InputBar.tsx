import { useState, useRef, type KeyboardEvent } from "react";
import type { ChatContext, GroupMode } from "../types";
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

  const recipientCount =
    groupMode === "all"
      ? selectedClients.size
      : groupMode === "custom"
        ? selectedClients.size
        : 0;

  let chipMainText: string;
  let chipSubText: string;

  if (groupMode === "all") {
    chipMainText = "General";
    chipSubText = `· ${recipientCount} адресатов`;
  } else if (groupMode === "none") {
    chipMainText = "Только вы";
    chipSubText = "";
  } else {
    if (selectedClients.size <= 3) {
      chipMainText = Array.from(selectedClients).sort().join(", ");
      chipSubText = "";
    } else {
      chipMainText = "Группа";
      chipSubText = `· ${selectedClients.size} адресатов`;
    }
  }

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
          <span className={s.statusLabel}>Контекст</span>
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
      <div className={s.card}>
        <div className={s.recipientRow}>
          <span className={s.recipientLabel}>Кому:</span>
          <span className={s.chip}>
            <span className={s.chipDot} />
            <span className={s.chipText}>{chipMainText}</span>
            {chipSubText && <span className={s.chipSub}>{chipSubText}</span>}
          </span>
        </div>
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
        <div className={s.actionRow}>
          <button
            className={s.attachBtn}
            type="button"
            aria-label="Прикрепить файл"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <span className={s.hint}>
            <span className={s.hintKey}>Enter</span> отправить{" "}
            <span className={s.hintSep}>·</span>{" "}
            <span className={s.hintKey}>Shift+Enter</span> новая строка
          </span>
          <button
            className={s.sendBtn}
            onClick={handleSend}
            disabled={sendDisabled}
            aria-label="Отправить"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5m-7 7 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
