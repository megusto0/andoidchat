import { memo, useEffect, useMemo, useRef } from "react";
import type { Message } from "../types";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { MessageBubble } from "./MessageBubble";
import s from "./ChatArea.module.css";

interface Props {
  messages: Message[];
  ownName: string;
}

function isGroupable(type: string): boolean {
  return type === "own" || type === "other";
}

function ChatAreaInner({ messages, ownName }: Props) {
  const previousLengthRef = useRef(0);
  const { containerRef, showScrollButton, scrollToBottom } =
    useAutoScroll(messages.length);
  const isBulkRestore =
    messages.length > 40 && messages.length - previousLengthRef.current > 20;

  useEffect(() => {
    previousLengthRef.current = messages.length;
  }, [messages.length]);

  const renderedMessages = useMemo(
    () =>
      messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];

        const isFirstInGroup =
          !isGroupable(msg.type) ||
          !prev ||
          prev.type !== msg.type ||
          prev.sender !== msg.sender;

        const isLastInGroup =
          !isGroupable(msg.type) ||
          !next ||
          next.type !== msg.type ||
          next.sender !== msg.sender;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            ownName={ownName}
            isFirstInGroup={isFirstInGroup}
            isLastInGroup={isLastInGroup}
            animate={!isBulkRestore}
          />
        );
      }),
    [isBulkRestore, messages, ownName]
  );

  return (
    <div className={s.wrapper}>
      <div className={s.area} ref={containerRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className={s.emptyTitle}>Нет сообщений</div>
            <div className={s.emptyText}>
              Напишите первое сообщение, чтобы начать диалог
            </div>
          </div>
        ) : (
          renderedMessages
        )}
      </div>
      {showScrollButton && (
        <button className={s.scrollBtn} onClick={scrollToBottom}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,9 12,15 18,9" />
          </svg>
          Новые сообщения
        </button>
      )}
    </div>
  );
}

export const ChatArea = memo(ChatAreaInner);
