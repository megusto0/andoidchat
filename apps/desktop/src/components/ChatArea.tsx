import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../types";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { formatSimulationSender } from "../utils/simulationNames";
import { MessageBubble } from "./MessageBubble";
import s from "./ChatArea.module.css";

interface Props {
  messages: Message[];
  ownName: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(timestamp: Date): string {
  return `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
}

function isGroupable(type: string): boolean {
  return type === "own" || type === "other";
}

function renderMessages(
  messages: Message[],
  ownName: string,
  animate: boolean
) {
  return messages.map((msg, i) => {
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
        animate={animate}
      />
    );
  });
}

function ChatAreaInner({ messages, ownName }: Props) {
  const previousLengthRef = useRef(0);
  const simulationBodyRef = useRef<HTMLDivElement | null>(null);
  const { containerRef, showScrollButton, scrollToBottom } =
    useAutoScroll(messages.length);
  const [simulationCollapsed, setSimulationCollapsed] = useState(true);
  const isBulkRestore =
    messages.length > 40 && messages.length - previousLengthRef.current > 20;

  useEffect(() => {
    previousLengthRef.current = messages.length;
  }, [messages.length]);

  const [regularMessages, simulationMessages] = useMemo(() => {
    const regular: Message[] = [];
    const simulation: Message[] = [];

    for (const message of messages) {
      if (message.simulationId) {
        simulation.push(message);
      } else {
        regular.push(message);
      }
    }

    return [regular, simulation];
  }, [messages]);

  useEffect(() => {
    if (simulationMessages.length === 0) {
      setSimulationCollapsed(true);
    }
  }, [simulationMessages.length]);

  useEffect(() => {
    if (simulationCollapsed) {
      return;
    }

    const body = simulationBodyRef.current;
    if (!body) {
      return;
    }

    body.scrollTop = body.scrollHeight;
  }, [simulationCollapsed, simulationMessages.length]);

  const renderedMessages = useMemo(
    () => renderMessages(regularMessages, ownName, !isBulkRestore),
    [isBulkRestore, ownName, regularMessages]
  );

  const renderedSimulationMessages = useMemo(
    () =>
      simulationMessages.map((message) => (
        <div className={s.simulationFeedRow} key={message.id}>
          <span className={s.simulationFeedTime}>
            {formatTime(message.timestamp)}
          </span>
          <span className={s.simulationFeedSender}>
            {formatSimulationSender(
              message.sender,
              Boolean(message.simulationId)
            )}
          </span>
          <span className={s.simulationFeedText}>{message.text}</span>
        </div>
      )),
    [simulationMessages]
  );

  const latestSimulation = simulationMessages[simulationMessages.length - 1];
  const hasContent = regularMessages.length > 0 || simulationMessages.length > 0;

  return (
    <div className={s.wrapper}>
      <div className={s.area} ref={containerRef} role="log" aria-live="polite">
        {!hasContent ? (
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
          <>
            {renderedMessages}
            {simulationMessages.length > 0 && (
              <section className={s.simulationPanel} aria-label="Лента симуляции">
                <button
                  className={s.simulationToggle}
                  type="button"
                  onClick={() => setSimulationCollapsed((value) => !value)}
                  aria-expanded={!simulationCollapsed}
                >
                  <div className={s.simulationToggleLead}>
                    <span className={s.simulationToggleDot} />
                    <span className={s.simulationToggleTitle}>Visible Simulation</span>
                    <span className={s.simulationToggleCount}>
                      {simulationMessages.length}
                    </span>
                  </div>
                  <div className={s.simulationToggleMeta}>
                    {latestSimulation ? (
                      <span className={s.simulationToggleSummary}>
                        {formatSimulationSender(
                          latestSimulation.sender,
                          Boolean(latestSimulation.simulationId)
                        )}
                        : {latestSimulation.text}
                      </span>
                    ) : null}
                    <span className={s.simulationToggleAction}>
                      {simulationCollapsed ? "Показать" : "Свернуть"}
                    </span>
                  </div>
                </button>
                {!simulationCollapsed && (
                  <div
                    className={s.simulationBody}
                    ref={simulationBodyRef}
                    role="log"
                    aria-label="Сообщения симуляции"
                    onWheel={(event) => event.stopPropagation()}
                  >
                    {renderedSimulationMessages}
                  </div>
                )}
              </section>
            )}
          </>
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
